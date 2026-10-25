import type { ProjectEventType, ProjectStageStatus, ProjectStatus } from "@/features/projects/types";

export const projectStatuses: ProjectStatus[] = [
  "planning",
  "in_progress",
  "paused",
  "awaiting_client",
  "completed",
  "cancelled",
];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausado",
  awaiting_client: "Aguardando aprovação do cliente",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const projectEventLabels: Record<ProjectEventType, string> = {
  created: "Projeto criado",
  created_from_proposal: "Criado a partir de proposta",
  status_changed: "Situação alterada",
  owner_changed: "Responsável alterado",
  deadline_changed: "Prazo de entrega alterado",
  completed: "Projeto concluído",
  cancelled: "Projeto cancelado",
  stage_created: "Etapa criada",
  stage_updated: "Etapa alterada",
  stage_reordered: "Etapas reordenadas",
  stage_archived: "Etapa arquivada",
};

export const projectStageStatusLabels: Record<ProjectStageStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  skipped: "Pulada",
};

export const projectStageStatusStyles: Record<ProjectStageStatus, string> = {
  pending: "bg-soft text-muted",
  in_progress: "bg-brand-soft text-brand",
  completed: "bg-positive-soft text-positive",
  skipped: "bg-warning-soft text-warning",
};

export const projectStatusStyles: Record<ProjectStatus, string> = {
  planning: "bg-soft text-muted",
  in_progress: "bg-brand-soft text-brand",
  paused: "bg-warning-soft text-warning",
  awaiting_client: "bg-warning-soft text-warning",
  completed: "bg-positive-soft text-positive",
  cancelled: "bg-danger-soft text-danger",
};
