import type { ActivityType, ClientKind, ClientStatus, OpportunityOutcome } from "@/features/crm/types";

export const clientKindLabels: Record<ClientKind, string> = {
  company: "Empresa",
  person: "Pessoa",
};

export const clientStatusLabels: Record<ClientStatus, string> = {
  lead: "Lead",
  active: "Cliente ativo",
  inactive: "Inativo",
};

export const activityTypeLabels: Record<ActivityType, string> = {
  call: "Ligação",
  email: "E-mail",
  meeting: "Reunião",
  note: "Observação",
  proposal: "Proposta",
  message: "Mensagem",
  other: "Outro",
};

export const opportunityOutcomeLabels: Record<OpportunityOutcome, string> = {
  open: "Em aberto",
  won: "Ganha",
  lost: "Perdida",
};

export const clientStatuses = Object.keys(clientStatusLabels) as ClientStatus[];
export const clientKinds = Object.keys(clientKindLabels) as ClientKind[];
export const activityTypes = Object.keys(activityTypeLabels) as ActivityType[];
