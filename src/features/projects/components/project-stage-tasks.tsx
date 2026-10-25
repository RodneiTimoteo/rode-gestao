import type { CrmMember } from "@/features/crm/types";
import {
  projectTaskPriorityLabels,
  projectTaskPriorityStyles,
  projectTaskStatusLabels,
  projectTaskStatusStyles,
} from "@/features/projects/constants";
import { formatProjectDate } from "@/features/projects/format";
import { projectTaskAssigneeName } from "@/features/projects/presentation";
import type { ProjectTaskRecord } from "@/features/projects/types";

export function ProjectStageTasks({ stageName, tasks, members }: {
  stageName: string;
  tasks: ProjectTaskRecord[];
  members: CrmMember[];
}) {
  return (
    <section aria-label={`Tarefas da etapa ${stageName}`} className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-strong">Tarefas</h4>
        <span className="text-xs text-subtle">{tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}</span>
      </div>

      {!tasks.length ? (
        <p className="mt-3 rounded-lg border border-dashed border-line bg-soft/20 px-3 py-3 text-xs text-muted">
          Nenhuma tarefa cadastrada nesta etapa.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {tasks.map((task) => {
            const cancelled = task.status === "cancelled";
            return (
              <li key={task.id} className={`rounded-xl border p-3 sm:p-4 ${cancelled ? "border-danger/20 bg-danger-soft/30" : "border-line bg-surface"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-subtle" aria-label={`Posição ${task.position}`}>{task.position}.</span>
                      <h5 className={`break-words text-sm font-semibold ${cancelled ? "text-muted line-through" : "text-strong"}`}>{task.title}</h5>
                    </div>
                    {task.description && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-muted">{task.description}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${projectTaskStatusStyles[task.status]}`}>
                      {projectTaskStatusLabels[task.status]}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${projectTaskPriorityStyles[task.priority]}`}>
                      Prioridade {projectTaskPriorityLabels[task.priority].toLowerCase()}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 border-t border-line/70 pt-3 text-xs sm:grid-cols-3">
                  <div><dt className="font-medium text-subtle">Responsável</dt><dd className="mt-0.5 text-strong">{projectTaskAssigneeName(task.assigned_to, members)}</dd></div>
                  <div><dt className="font-medium text-subtle">Prazo previsto</dt><dd className="mt-0.5 text-strong">{formatProjectDate(task.due_date)}</dd></div>
                  <div><dt className="font-medium text-subtle">Conclusão</dt><dd className="mt-0.5 text-strong">{formatProjectDate(task.completed_at, true)}</dd></div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
