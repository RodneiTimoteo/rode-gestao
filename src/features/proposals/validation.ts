import { isUuid, parseCurrency } from "../crm/validation.ts";
import type { OrganizationRole } from "@/features/crm/types";
import type { ProposalFormItem, ProposalInput, ProposalOptionsInput, ProposalStatus } from "@/features/proposals/types";
import { normalizeProposalItem, roundProposalNumber } from "./calculations.ts";

export const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_QUANTITY = 99_999_999_999.999;
const MAX_UNIT_PRICE = 999_999_999_999.99;
const MAX_LINE_TOTAL = 99_999_999_999_999.99;

function stringValue(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optional(value: string) { return value || null; }

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseItemsValue(rawItems: unknown, minimum: number, maximum: number, label: string) {
  const items: ProposalFormItem[] = [];
  if (!Array.isArray(rawItems) || rawItems.length < minimum) return { items, error: minimum === 0 ? `${label} deve ser uma lista.` : `${label} deve conter pelo menos ${minimum} item.` };
  if (rawItems.length > maximum) return { items, error: `${label} aceita no máximo ${maximum} itens.` };

  let error: string | undefined;
  rawItems.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") { error = `${label}: item ${index + 1} inválido.`; return; }
    const item = raw as Record<string, unknown>;
    const serviceId = typeof item.service_id === "string" && item.service_id ? item.service_id : null;
    const name = String(item.service_name ?? "").trim().slice(0, 200);
    const description = String(item.description ?? "").trim().slice(0, 4000);
    const quantity = Number(item.quantity);
    const unitPrice = typeof item.unit_price === "number" ? item.unit_price : parseCurrency(String(item.unit_price ?? ""));
    const discount = typeof item.discount_amount === "number" ? item.discount_amount : parseCurrency(String(item.discount_amount ?? ""));
    if (serviceId && !isUuid(serviceId)) error = `${label}: serviço inválido no item ${index + 1}.`;
    if (!name || !description) error = `${label}: preencha nome e descrição do item ${index + 1}.`;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) error = `${label}: quantidade inválida no item ${index + 1}.`;
    if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_UNIT_PRICE) error = `${label}: valor unitário inválido no item ${index + 1}.`;
    const normalizedItem = normalizeProposalItem({
      service_id: serviceId,
      service_name: name,
      description,
      quantity,
      unit_price: Number(unitPrice ?? 0),
      discount_amount: discount ?? 0,
    });
    const gross = normalizedItem.quantity * normalizedItem.unit_price;
    const roundedGross = roundProposalNumber(gross, 2);
    if (!Number.isFinite(gross) || gross > MAX_LINE_TOTAL) error = `${label}: o total do item ${index + 1} excede o limite permitido.`;
    if (!Number.isFinite(normalizedItem.discount_amount) || normalizedItem.discount_amount < 0 || normalizedItem.discount_amount > roundedGross || normalizedItem.discount_amount > MAX_UNIT_PRICE) error = `${label}: desconto inválido no item ${index + 1}.`;
    items.push(normalizedItem);
  });
  return { items, error };
}

export function parseProposalInput(formData: FormData):
  | { success: true; data: ProposalInput }
  | { success: false; message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const clientId = stringValue(formData, "client_id", 36);
  const opportunityId = stringValue(formData, "opportunity_id", 36);
  const title = stringValue(formData, "title", 180);
  const validUntil = stringValue(formData, "valid_until", 10);
  if (!isUuid(clientId)) fieldErrors.client_id = "Selecione um cliente válido.";
  if (opportunityId && !isUuid(opportunityId)) fieldErrors.opportunity_id = "Selecione uma oportunidade válida.";
  if (!title) fieldErrors.title = "Informe o título da proposta.";
  if (validUntil && !isValidDateInput(validUntil)) fieldErrors.valid_until = "Informe uma data válida.";

  let rawItems: unknown;
  try { rawItems = JSON.parse(stringValue(formData, "items", 200000)); } catch { rawItems = null; }
  const parsedItems = parseItemsValue(rawItems, 1, 100, "A proposta");
  const items = parsedItems.items;
  if (parsedItems.error) fieldErrors.items = parsedItems.error;

  if (Object.keys(fieldErrors).length) return { success: false, message: "Revise os campos destacados.", fieldErrors };
  return { success: true, data: {
    client_id: clientId, opportunity_id: optional(opportunityId), title,
    valid_until: optional(validUntil), payment_terms: optional(stringValue(formData, "payment_terms", 4000)),
    execution_deadline: optional(stringValue(formData, "execution_deadline", 1000)),
    notes: optional(stringValue(formData, "notes", 4000)), commercial_terms: optional(stringValue(formData, "commercial_terms", 8000)), items,
  } };
}

export function parseProposalOptionsInput(formData: FormData):
  | { success: true; data: ProposalOptionsInput }
  | { success: false; message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const clientId = stringValue(formData, "client_id", 36);
  const opportunityId = stringValue(formData, "opportunity_id", 36);
  const title = stringValue(formData, "title", 180);
  const validUntil = stringValue(formData, "valid_until", 10);
  if (!isUuid(clientId)) fieldErrors.client_id = "Selecione um cliente válido.";
  if (opportunityId && !isUuid(opportunityId)) fieldErrors.opportunity_id = "Selecione uma oportunidade válida.";
  if (!title) fieldErrors.title = "Informe o título da proposta.";
  if (validUntil && !isValidDateInput(validUntil)) fieldErrors.valid_until = "Informe uma data válida.";

  let rawCommonItems: unknown;
  let rawOptions: unknown;
  try { rawCommonItems = JSON.parse(stringValue(formData, "common_items", 200000) || "[]"); } catch { rawCommonItems = null; }
  try { rawOptions = JSON.parse(stringValue(formData, "options", 500000)); } catch { rawOptions = null; }
  const common = parseItemsValue(rawCommonItems, 0, 100, "Itens comuns");
  if (common.error) fieldErrors.common_items = common.error;

  const options: ProposalOptionsInput["options"] = [];
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 3) {
    fieldErrors.options = "Adicione duas ou três opções comerciais.";
  } else {
    const names = new Set<string>();
    rawOptions.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") { fieldErrors.options = `Opção ${index + 1} inválida.`; return; }
      const option = raw as Record<string, unknown>;
      const name = String(option.name ?? "").trim().slice(0, 120);
      const description = optional(String(option.description ?? "").trim().slice(0, 4000));
      const normalizedName = name.toLocaleLowerCase("pt-BR");
      if (!name) fieldErrors.options = `Informe o nome da opção ${index + 1}.`;
      if (names.has(normalizedName)) fieldErrors.options = "Os nomes das opções devem ser diferentes.";
      names.add(normalizedName);
      const parsedOptionItems = parseItemsValue(option.items, 1, 100, `Opção ${index + 1}`);
      if (parsedOptionItems.error) fieldErrors.options = parsedOptionItems.error;
      options.push({ name, description, items: parsedOptionItems.items });
    });
  }

  if (Object.keys(fieldErrors).length) return { success: false, message: "Revise os campos destacados.", fieldErrors };
  return { success: true, data: {
    proposal_format: "options",
    client_id: clientId,
    opportunity_id: optional(opportunityId),
    title,
    valid_until: optional(validUntil),
    payment_terms: optional(stringValue(formData, "payment_terms", 4000)),
    execution_deadline: optional(stringValue(formData, "execution_deadline", 1000)),
    notes: optional(stringValue(formData, "notes", 4000)),
    commercial_terms: optional(stringValue(formData, "commercial_terms", 8000)),
    common_items: common.items,
    options,
  } };
}

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus, canApprove: boolean) {
  if (to === "approved") return canApprove && ["sent", "negotiating"].includes(from);
  const allowed: Partial<Record<ProposalStatus, ProposalStatus[]>> = {
    draft: ["sent", "cancelled"],
    sent: ["negotiating", "rejected", "expired", "cancelled"],
    negotiating: ["sent", "rejected", "expired", "cancelled"],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function validatePdfFile(file: { name: string; type: string; size: number }, contents: Uint8Array) {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Selecione um arquivo com extensão .pdf.";
  if (file.type !== "application/pdf") return "O tipo do arquivo deve ser application/pdf.";
  if (file.size <= 0 || file.size > MAX_PDF_SIZE) return "O PDF deve ter no máximo 20 MB.";
  const magic = String.fromCharCode(...contents.slice(0, 5));
  if (magic !== "%PDF-") return "O conteúdo enviado não possui uma assinatura PDF válida.";
  const tail = new TextDecoder("latin1").decode(contents.slice(Math.max(0, contents.length - 2048)));
  if (!tail.includes("%%EOF")) return "O arquivo não possui uma estrutura PDF completa.";
  return null;
}

export function canReplaceAttachment(role: OrganizationRole, userId: string, uploadedBy: string) {
  return role === "owner" || role === "admin" || userId === uploadedBy;
}
