import type { ProjectEventType, ProjectStageStatus, ProjectStatus, ProjectTaskPriority, ProjectTaskStatus } from "@/features/projects/types";

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
  task_created: "Tarefa criada",
  task_updated: "Tarefa alterada",
  task_status_changed: "Situação da tarefa alterada",
  task_completed: "Tarefa concluída",
  task_reopened: "Tarefa reaberta",
  task_assignee_changed: "Responsável da tarefa alterado",
  task_deadline_changed: "Prazo da tarefa alterado",
  task_reordered: "Tarefas reordenadas",
};

export const projectTaskStatusLabels: Record<ProjectTaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
  cancelled: "Cancelada",
};

export const projectTaskStatusStyles: Record<ProjectTaskStatus, string> = {
  todo: "bg-soft text-muted",
  in_progress: "bg-brand-soft text-brand",
  blocked: "bg-warning-soft text-warning",
  done: "bg-positive-soft text-positive",
  cancelled: "bg-danger-soft text-danger",
};

export const projectTaskPriorityLabels: Record<ProjectTaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const projectTaskPriorityStyles: Record<ProjectTaskPriority, string> = {
  low: "bg-soft text-muted",
  medium: "bg-brand-soft text-brand",
  high: "bg-warning-soft text-warning",
  urgent: "bg-danger-soft text-danger",
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
