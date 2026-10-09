import type { ProposalStatus } from "@/features/proposals/types";

export const proposalStatuses: ProposalStatus[] = ["draft", "sent", "negotiating", "approved", "rejected", "expired", "cancelled"];

export const proposalStatusLabels: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  negotiating: "Em negociação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export const terminalProposalStatuses: ProposalStatus[] = ["approved", "rejected", "expired", "cancelled"];

export const proposalEventLabels: Record<string, string> = {
  created: "Proposta criada",
  revision_created: "Revisão criada",
  sent: "Proposta enviada",
  status_changed: "Status alterado",
  approved: "Proposta aprovada",
  rejected: "Proposta rejeitada",
  cancelled: "Proposta cancelada",
  expired: "Proposta expirada",
  attachment_added: "Documento anexado",
  attachment_replaced: "Nova versão anexada",
  option_selected: "Opção comercial selecionada",
  option_selection_changed: "Opção comercial alterada",
  note: "Observação adicionada",
};
