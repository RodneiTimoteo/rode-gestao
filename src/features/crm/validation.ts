import { activityTypes, clientKinds, clientStatuses } from "./constants.ts";
import type {
  ActivityType,
  ClientKind,
  ClientStatus,
  OpportunityOutcome,
  PipelineStage,
} from "./types.ts";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string; fieldErrors: Record<string, string> };

type ClientInput = {
  kind: ClientKind;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  responsible_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  country: string;
  source: string | null;
  notes: string | null;
  status: ClientStatus;
  assigned_to: string | null;
};

type OpportunityInput = {
  title: string;
  service_interest: string | null;
  estimated_value: number | null;
  pipeline_stage_id: string;
  owner_user_id: string | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
};

type ActivityInput = {
  activity_type: ActivityType;
  description: string;
  opportunity_id: string | null;
  occurred_at: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalText(formData: FormData, key: string, maxLength: number) {
  const value = text(formData, key, maxLength);
  return value || null;
}

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function isRecordInOrganization(recordOrganizationId: string, activeOrganizationId: string) {
  return recordOrganizationId === activeOrganizationId;
}

export function parseClientInput(formData: FormData): ValidationResult<ClientInput> {
  const fieldErrors: Record<string, string> = {};
  const name = text(formData, "name", 160);
  const rawKind = text(formData, "kind", 20) as ClientKind;
  const rawStatus = text(formData, "status", 20) as ClientStatus;
  const email = optionalText(formData, "email", 254)?.toLowerCase() ?? null;
  const stateValue = optionalText(formData, "state", 2)?.toUpperCase() ?? null;
  const taxDigits = text(formData, "tax_id", 30).replace(/\D/g, "");
  const assignedTo = optionalText(formData, "assigned_to", 36);

  if (!name) fieldErrors.name = "Informe o nome do cliente.";
  if (!clientKinds.includes(rawKind)) fieldErrors.kind = "Selecione um tipo válido.";
  if (!clientStatuses.includes(rawStatus)) fieldErrors.status = "Selecione um status válido.";
  if (email && !emailPattern.test(email)) fieldErrors.email = "Informe um e-mail válido.";
  if (stateValue && !/^[A-Z]{2}$/.test(stateValue)) fieldErrors.state = "Use a sigla do estado com 2 letras.";
  if (taxDigits && ![11, 14].includes(taxDigits.length)) fieldErrors.tax_id = "Informe um CPF ou CNPJ com 11 ou 14 dígitos.";
  if (assignedTo && !isUuid(assignedTo)) fieldErrors.assigned_to = "Responsável interno inválido.";

  if (Object.keys(fieldErrors).length) {
    return { success: false, message: "Revise os campos destacados.", fieldErrors };
  }

  return {
    success: true,
    data: {
      kind: rawKind,
      name,
      legal_name: optionalText(formData, "legal_name", 200),
      tax_id: taxDigits || null,
      responsible_name: optionalText(formData, "responsible_name", 160),
      contact_name: optionalText(formData, "contact_name", 160),
      email,
      phone: optionalText(formData, "phone", 40),
      whatsapp: optionalText(formData, "whatsapp", 40),
      segment: optionalText(formData, "segment", 120),
      city: optionalText(formData, "city", 120),
      state: stateValue,
      country: text(formData, "country", 100) || "Brasil",
      source: optionalText(formData, "source", 160),
      notes: optionalText(formData, "notes", 4000),
      status: rawStatus,
      assigned_to: assignedTo,
    },
  };
}

export function parseCurrency(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const numericValue = normalized.replace(/[^0-9.-]/g, "");
  if (!numericValue || numericValue === "-" || numericValue === ".") return Number.NaN;
  const amount = Number(numericValue);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function parseOpportunityInput(formData: FormData): ValidationResult<OpportunityInput> {
  const fieldErrors: Record<string, string> = {};
  const title = text(formData, "title", 180);
  const stageId = text(formData, "pipeline_stage_id", 36);
  const ownerId = optionalText(formData, "owner_user_id", 36);
  const expectedDate = optionalText(formData, "expected_close_date", 10);
  const amount = parseCurrency(text(formData, "estimated_value", 30));

  if (!title) fieldErrors.title = "Informe um título para a oportunidade.";
  if (!isUuid(stageId)) fieldErrors.pipeline_stage_id = "Selecione uma etapa válida.";
  if (ownerId && !isUuid(ownerId)) fieldErrors.owner_user_id = "Responsável inválido.";
  if (expectedDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) fieldErrors.expected_close_date = "Informe uma data válida.";
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) fieldErrors.estimated_value = "Informe um valor igual ou maior que zero.";

  if (Object.keys(fieldErrors).length) {
    return { success: false, message: "Revise os campos destacados.", fieldErrors };
  }

  return {
    success: true,
    data: {
      title,
      service_interest: optionalText(formData, "service_interest", 200),
      estimated_value: amount,
      pipeline_stage_id: stageId,
      owner_user_id: ownerId,
      expected_close_date: expectedDate,
      lost_reason: optionalText(formData, "lost_reason", 1000),
      notes: optionalText(formData, "notes", 4000),
    },
  };
}

export function parseActivityInput(formData: FormData): ValidationResult<ActivityInput> {
  const fieldErrors: Record<string, string> = {};
  const rawType = text(formData, "activity_type", 20) as ActivityType;
  const description = text(formData, "description", 4000);
  const opportunityId = optionalText(formData, "opportunity_id", 36);
  const occurredAtInput = text(formData, "occurred_at", 30);
  const occurredAtDate = occurredAtInput ? new Date(occurredAtInput) : new Date();

  if (!activityTypes.includes(rawType)) fieldErrors.activity_type = "Selecione um tipo válido.";
  if (!description) fieldErrors.description = "Descreva a atividade.";
  if (opportunityId && !isUuid(opportunityId)) fieldErrors.opportunity_id = "Oportunidade inválida.";
  if (Number.isNaN(occurredAtDate.getTime())) fieldErrors.occurred_at = "Informe uma data válida.";

  if (Object.keys(fieldErrors).length) {
    return { success: false, message: "Revise os campos destacados.", fieldErrors };
  }

  return {
    success: true,
    data: {
      activity_type: rawType,
      description,
      opportunity_id: opportunityId,
      occurred_at: occurredAtDate.toISOString(),
    },
  };
}

export function validateLostReason(stage: Pick<PipelineStage, "outcome">, lostReason: string | null) {
  return stage.outcome !== "lost" || Boolean(lostReason?.trim());
}

export function deriveOpportunityState(
  outcome: OpportunityOutcome,
  lostReason: string | null,
  closedAt: string,
) {
  if (outcome === "open") return { outcome, closed_at: null, lost_reason: null };
  return {
    outcome,
    closed_at: closedAt,
    lost_reason: outcome === "lost" ? lostReason : null,
  };
}
