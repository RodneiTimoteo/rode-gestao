import { projectStatusLabels, projectStatusStyles } from "@/features/projects/constants";
import type { ProjectStatus } from "@/features/projects/types";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${projectStatusStyles[status]}`}>{projectStatusLabels[status]}</span>;
}
