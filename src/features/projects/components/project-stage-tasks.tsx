"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { CrmMember } from "@/features/crm/types";
import {
  projectTaskPriorityLabels,
  projectTaskPriorityStyles,
  projectTaskStatusLabels,
  projectTaskStatusStyles,
} from "@/features/projects/constants";
import { formatProjectDate } from "@/features/projects/format";
import { projectTaskAssigneeName } from "@/features/projects/presentation";
import { ProjectTaskCreate } from "@/features/projects/components/project-task-create";
import type { ProjectActionState, ProjectTaskRecord } from "@/features/projects/types";

export function ProjectStageTasks({ stageName, tasks, members, editable, createTask }: {
  stageName: string;
  tasks: ProjectTaskRecord[];
  members: CrmMember[];
  editable: boolean;
  createTask: (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <section aria-label={`Tarefas da etapa ${stageName}`} className="border-t border-line bg-soft/25 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h4 className="min-w-0">
          <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((current) => !current)} className="inline-flex min-h-9 items-center gap-2 rounded-lg text-left text-sm font-semibold text-strong outline-none hover:text-brand focus-visible:ring-4 focus-visible:ring-brand-soft">
            <Icon name="chevronRight" className={`size-4 shrink-0 text-brand transition-transform ${expanded ? "rotate-90" : ""}`} />
            <span>Tarefas desta etapa</span>
          </button>
        </h4>
        <span className="ml-auto text-[11px] font-medium text-subtle">{tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}</span>
        {editable && <ProjectTaskCreate action={createTask} members={members} />}
      </div>

      <div id={contentId} hidden={!expanded}>
        {!tasks.length ? (
          <div className="mt-2.5 flex flex-col items-center justify-center py-4 text-center">
            <Icon name="list" className="size-4 text-brand" />
            <p className="mt-2 text-xs font-semibold text-strong">Nenhuma tarefa nesta etapa</p>
            <p className="mt-1 text-xs text-muted">Adicione tarefas para organizar a execução desta etapa</p>
          </div>
        ) : (
          <div className="mt-2">
            <div className="hidden grid-cols-[2rem_minmax(0,1.6fr)_minmax(7.5rem,0.75fr)_6.5rem_7.5rem_minmax(8.5rem,auto)] gap-3 border-b border-line/80 px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle lg:grid">
              <span aria-hidden="true" />
              <span>Tarefa</span>
              <span>Responsável</span>
              <span>Prazo</span>
              <span>Conclusão</span>
              <span>Situação / prioridade</span>
            </div>
            <ol className="divide-y divide-line/80">
            {tasks.map((task) => {
              const cancelled = task.status === "cancelled";
              return (
                <li key={task.id} className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-1 py-3 lg:grid-cols-[2rem_minmax(0,1.6fr)_minmax(7.5rem,0.75fr)_6.5rem_7.5rem_minmax(8.5rem,auto)] lg:items-start ${cancelled ? "bg-danger-soft/15" : ""}`}>
                  <span className="text-[11px] font-semibold text-subtle" aria-label={`Posição ${task.position}`}>{task.position}.</span>
                  <div className="min-w-0">
                    <h5 className={`break-words text-sm font-medium leading-5 ${cancelled ? "text-muted line-through" : "text-strong"}`}>{task.title}</h5>
                    {task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{task.description}</p>}
                  </div>

                  <dl className="col-span-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3 lg:col-span-3 lg:contents">
                    <div className="min-w-0"><dt className="text-subtle lg:sr-only">Responsável</dt><dd className="truncate font-medium text-muted">{projectTaskAssigneeName(task.assigned_to, members)}</dd></div>
                    <div><dt className="text-subtle lg:sr-only">Prazo</dt><dd className="font-medium text-muted">{formatProjectDate(task.due_date)}</dd></div>
                    <div><dt className="text-subtle lg:sr-only">Conclusão</dt><dd className="font-medium text-muted">{formatProjectDate(task.completed_at, true)}</dd></div>
                  </dl>

                  <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1 lg:justify-start">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${projectTaskStatusStyles[task.status]}`}>
                      {projectTaskStatusLabels[task.status]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${projectTaskPriorityStyles[task.priority]}`}>
                      {projectTaskPriorityLabels[task.priority]}
                    </span>
                  </div>
                </li>
              );
            })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
