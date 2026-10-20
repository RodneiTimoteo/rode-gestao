import { projectStatusLabels, projectStatuses } from "@/features/projects/constants";
import type { ProjectStatus } from "@/features/projects/types";

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
