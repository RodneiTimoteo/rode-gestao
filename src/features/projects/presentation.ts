import { projectStageStatusLabels, projectStatusLabels, projectStatuses, projectTaskStatusLabels } from "@/features/projects/constants";
import type { CrmMember } from "@/features/crm/types";
import type { ProjectStageStatus, ProjectStatus, ProjectTaskRecord, ProjectTaskStatus } from "@/features/projects/types";

const projectStageTransitions: Record<ProjectStageStatus, ProjectStageStatus[]> = {
  pending: ["in_progress", "skipped"],
  in_progress: ["pending", "completed", "skipped"],
  completed: ["in_progress"],
  skipped: ["pending"],
};

const statusCodePattern = new RegExp(
  `\\b(${[...projectStatuses].sort((left, right) => right.length - left.length).join("|")})\\b`,
  "g",
);

function projectStatusFromEvent(value: unknown): ProjectStatus | null {
  return typeof value === "string" && projectStatuses.includes(value as ProjectStatus)
    ? (value as ProjectStatus)
    : null;
}

function eventText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function isProjectStageStatus(value: unknown): value is ProjectStageStatus {
  return typeof value === "string" && Object.hasOwn(projectStageTransitions, value);
}

export function getProjectStageTransitions(status: ProjectStageStatus) {
  return [...projectStageTransitions[status]];
}

export function projectStageTransitionLabel(from: ProjectStageStatus, to: ProjectStageStatus) {
  if (to === "in_progress") return from === "completed" ? "Reabrir etapa" : "Iniciar etapa";
  if (to === "pending") return from === "skipped" ? "Reativar como pendente" : "Voltar para pendente";
  if (to === "completed") return "Concluir etapa";
  return "Pular etapa";
}

export function getProjectStageStatusEventDetails(eventData: Record<string, unknown>) {
  const fromData = eventData.from;
  const toData = eventData.to;
  const fromStatus = typeof fromData === "object" && fromData !== null && "status" in fromData
    ? (fromData as Record<string, unknown>).status
    : null;
  const toStatus = typeof toData === "object" && toData !== null && "status" in toData
    ? (toData as Record<string, unknown>).status
    : null;
  return {
    from: isProjectStageStatus(fromStatus) ? projectStageStatusLabels[fromStatus] : null,
    to: isProjectStageStatus(toStatus) ? projectStageStatusLabels[toStatus] : null,
  };
}

export function getProjectTaskStatusEventDetails(eventData: Record<string, unknown>) {
  const from = eventData.from;
  const to = eventData.to;
  return {
    from: typeof from === "string" && Object.hasOwn(projectTaskStatusLabels, from)
      ? projectTaskStatusLabels[from as ProjectTaskStatus]
      : null,
    to: typeof to === "string" && Object.hasOwn(projectTaskStatusLabels, to)
      ? projectTaskStatusLabels[to as ProjectTaskStatus]
      : null,
  };
}

export function translateProjectStatusDescription(description: string) {
  return description.replace(statusCodePattern, (status) => projectStatusLabels[status as ProjectStatus]);
}

export function getProjectStatusEventDetails(eventData: Record<string, unknown>) {
  const from = projectStatusFromEvent(eventData.from);
  const to = projectStatusFromEvent(eventData.to);

  return {
    from: from ? projectStatusLabels[from] : null,
    to: to ? projectStatusLabels[to] : null,
  };
}

export function getProjectDeadlineEventDetails(eventData: Record<string, unknown>) {
  return {
    from: eventText(eventData.from),
    to: eventText(eventData.to),
  };
}

export function projectTransitionActionLabel(currentStatus: ProjectStatus, nextStatus: ProjectStatus) {
  if (nextStatus === "in_progress") {
    return currentStatus === "planning" ? "Iniciar projeto" : "Retomar projeto";
  }

  const labels: Partial<Record<ProjectStatus, string>> = {
    paused: "Pausar projeto",
    awaiting_client: "Aguardar aprovação do cliente",
    completed: "Concluir projeto",
    cancelled: "Cancelar projeto",
  };

  return labels[nextStatus] ?? projectStatusLabels[nextStatus];
}

export function normalizeProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function projectTaskProgressLabel(completed: number, eligible: number) {
  const safeCompleted = Math.max(0, Math.trunc(completed));
  const safeEligible = Math.max(0, Math.trunc(eligible));
  return `${safeCompleted} de ${safeEligible} ${safeEligible === 1 ? "tarefa concluída" : "tarefas concluídas"}`;
}

export function projectStageResponsibleName(responsibleUserId: string | null, members: CrmMember[]) {
  if (!responsibleUserId) return "Não atribuído";
  return members.find((member) => member.userId === responsibleUserId)?.displayName ?? "Membro indisponível";
}

export function projectTaskAssigneeName(assignedTo: string | null, members: CrmMember[]) {
  if (!assignedTo) return "Não atribuído";
  return members.find((member) => member.userId === assignedTo)?.displayName ?? "Membro indisponível";
}

export function groupProjectTasksByStage(tasks: ProjectTaskRecord[]) {
  const grouped = new Map<string, ProjectTaskRecord[]>();
  for (const task of tasks) {
    const stageTasks = grouped.get(task.project_stage_id) ?? [];
    stageTasks.push(task);
    grouped.set(task.project_stage_id, stageTasks);
  }
  for (const stageTasks of grouped.values()) {
    stageTasks.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  }
  return grouped;
}

export function isTerminalProjectStatus(status: ProjectStatus) {
  return status === "completed" || status === "cancelled";
}

export function projectEventActorName(snapshot: string | null | undefined, currentName?: string) {
  return snapshot?.trim() || currentName?.trim() || "Membro indisponível";
}

export function projectStagesAreEmpty(stages: readonly unknown[]) {
  return stages.length === 0;
}

export function projectStageReorderAvailability(index: number, count: number) {
  return {
    canMoveUp: count > 1 && index > 0 && index < count,
    canMoveDown: count > 1 && index >= 0 && index < count - 1,
  };
}
