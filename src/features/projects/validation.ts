import { isUuid, parseCurrency } from "../crm/validation.ts";
import type { ManualProjectInput, ProjectStageInput, ProjectStatus, ProposalProjectInput } from "./types.ts";

function stringValue(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optional(value: string) { return value || null; }

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function commonProjectInput(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const name = stringValue(formData, "name", 200);
  const ownerUserId = stringValue(formData, "owner_user_id", 36);
  const startDate = stringValue(formData, "start_date", 10);
  const expectedEndDate = stringValue(formData, "expected_end_date", 10);
  if (!name) fieldErrors.name = "Informe o nome do projeto.";
  if (ownerUserId && !isUuid(ownerUserId)) fieldErrors.owner_user_id = "Selecione um responsável válido.";
  if (startDate && !isValidDate(startDate)) fieldErrors.start_date = "Informe uma data válida.";
  if (expectedEndDate && !isValidDate(expectedEndDate)) fieldErrors.expected_end_date = "Informe uma data válida.";
  if (startDate && expectedEndDate && expectedEndDate < startDate) fieldErrors.expected_end_date = "O prazo não pode ser anterior ao início.";
  return {
    fieldErrors,
    data: {
      name,
      description: optional(stringValue(formData, "description", 8000)),
      owner_user_id: optional(ownerUserId),
      start_date: optional(startDate),
      expected_end_date: optional(expectedEndDate),
    },
  };
}

export function parseManualProjectInput(formData: FormData):
  | { success: true; data: ManualProjectInput }
  | { success: false; message: string; fieldErrors: Record<string, string> } {
  const parsed = commonProjectInput(formData);
  const clientId = stringValue(formData, "client_id", 36);
  const rawAmount = stringValue(formData, "contracted_amount", 40);
  const amount = rawAmount ? parseCurrency(rawAmount) : null;
  if (!isUuid(clientId)) parsed.fieldErrors.client_id = "Selecione um cliente válido.";
  if (rawAmount && (amount === null || amount < 0 || amount > 99_999_999_999_999.99)) {
    parsed.fieldErrors.contracted_amount = "Informe um valor contratado válido.";
  }
  if (Object.keys(parsed.fieldErrors).length) return { success: false, message: "Revise os campos destacados.", fieldErrors: parsed.fieldErrors };
  return { success: true, data: { ...parsed.data, client_id: clientId, contracted_amount: amount } };
}

export function parseProposalProjectInput(proposalId: string, formData: FormData):
  | { success: true; data: ProposalProjectInput }
  | { success: false; message: string; fieldErrors: Record<string, string> } {
  const parsed = commonProjectInput(formData);
  if (!isUuid(proposalId)) parsed.fieldErrors.proposal_id = "Selecione uma proposta aprovada válida.";
  if (Object.keys(parsed.fieldErrors).length) return { success: false, message: "Revise os campos destacados.", fieldErrors: parsed.fieldErrors };
  return { success: true, data: { ...parsed.data, proposal_id: proposalId } };
}

export function parseProjectStageInput(formData: FormData):
  | { success: true; data: ProjectStageInput }
  | { success: false; message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const responsibleUserId = String(formData.get("responsible_user_id") ?? "").trim();
  const plannedStartDate = String(formData.get("planned_start_date") ?? "").trim();
  const plannedEndDate = String(formData.get("planned_end_date") ?? "").trim();

  if (!name || name.length > 200) fieldErrors.name = "Informe um nome entre 1 e 200 caracteres.";
  if (description.length > 8000) fieldErrors.description = "A descrição deve ter no máximo 8.000 caracteres.";
  if (responsibleUserId && !isUuid(responsibleUserId)) fieldErrors.responsible_user_id = "Selecione um responsável válido.";
  if (plannedStartDate && !isValidDate(plannedStartDate)) fieldErrors.planned_start_date = "Informe uma data válida.";
  if (plannedEndDate && !isValidDate(plannedEndDate)) fieldErrors.planned_end_date = "Informe uma data válida.";
  if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
    fieldErrors.planned_end_date = "A data final não pode ser anterior à data inicial.";
  }

  if (Object.keys(fieldErrors).length) {
    return { success: false, message: "Revise os campos destacados.", fieldErrors };
  }
  return {
    success: true,
    data: {
      name,
      description: optional(description),
      responsible_user_id: optional(responsibleUserId),
      planned_start_date: optional(plannedStartDate),
      planned_end_date: optional(plannedEndDate),
    },
  };
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus) {
  const allowed: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    planning: ["in_progress", "paused", "awaiting_client", "cancelled"],
    in_progress: ["paused", "awaiting_client", "completed", "cancelled"],
    paused: ["in_progress", "awaiting_client", "cancelled"],
    awaiting_client: ["in_progress", "paused", "cancelled"],
  };
  return allowed[from]?.includes(to) ?? false;
}

export function validateStatusJustification(status: ProjectStatus, justification: string) {
  if (["paused", "awaiting_client"].includes(status) && !justification.trim()) {
    return "Informe o motivo desta situação.";
  }
  return null;
}

export function validateDeadlineChange(date: string, justification: string): Record<string, string> | null {
  if (!isValidDate(date)) return { expected_end_date: "Informe uma nova data válida." };
  if (!justification.trim()) return { justification: "A justificativa é obrigatória." };
  return null;
}
