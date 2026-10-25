"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { CrmMember } from "@/features/crm/types";
import { projectStageStatusLabels, projectStageStatusStyles } from "@/features/projects/constants";
import { ProjectStageCreate } from "@/features/projects/components/project-stage-create";
import { ProjectStageArchive } from "@/features/projects/components/project-stage-archive";
import { ProjectStageEdit } from "@/features/projects/components/project-stage-edit";
import { ProjectStageReorder } from "@/features/projects/components/project-stage-reorder";
import { ProjectStageStatusActions } from "@/features/projects/components/project-stage-status-actions";
import { ProjectStageTasks } from "@/features/projects/components/project-stage-tasks";
import { formatProjectDate } from "@/features/projects/format";
import {
  isTerminalProjectStatus,
  normalizeProgressPercent,
  projectStageResponsibleName,
  projectStageReorderAvailability,
  groupProjectTasksByStage,
  projectStagesAreEmpty,
  projectTaskProgressLabel,
} from "@/features/projects/presentation";
import type {
  ProjectProgress,
  ProjectActionState,
  ProjectStageProgress,
  ProjectStageRecord,
  ProjectStagesResult,
  ProjectStatus,
} from "@/features/projects/types";

function ProgressBar({ label, progress }: { label: string; progress: ProjectProgress | ProjectStageProgress }) {
  const percent = normalizeProgressPercent(progress.progress_percent);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-medium text-muted">{projectTaskProgressLabel(progress.completed_tasks, progress.eligible_tasks)}</p>
        <p className="font-semibold text-strong">{percent}%</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-2 overflow-hidden rounded-full bg-soft"
      >
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StageStatusBadge({ status }: { status: ProjectStageRecord["status"] }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${projectStageStatusStyles[status]}`}>
      {projectStageStatusLabels[status]}
    </span>
  );
}

function StageCard({
  stage,
  progress,
  members,
  editable,
  updateStage,
  changeStageStatus,
  archiveStage,
  reorderStage,
  canMoveUp,
  canMoveDown,
  tasks,
  createTask,
}: {
  stage: ProjectStageRecord;
  progress: ProjectStageProgress;
  members: CrmMember[];
  editable: boolean;
  updateStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  changeStageStatus: (stageId: string, nextStatus: ProjectStageRecord["status"], state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  archiveStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  reorderStage: (stageId: string, direction: "up" | "down", state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  tasks: ProjectStagesResult["tasks"];
  createTask: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const percent = normalizeProgressPercent(progress.progress_percent);

  return (
    <li className="overflow-hidden rounded-2xl border border-brand/35 bg-surface">
      <div className="flex min-h-16 flex-wrap items-center gap-3 bg-brand px-4 py-3 text-on-brand sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-on-brand/45 text-sm font-semibold" aria-label={`Posição ${stage.position}`}>
          {stage.position}
        </span>
        <h3 className="min-w-0 flex-1 break-words text-base font-semibold tracking-[-0.015em] sm:text-lg">{stage.name}</h3>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <StageStatusBadge status={stage.status} />
          <span className="hidden text-xs font-semibold text-on-brand/80 sm:inline">{percent}%</span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={`${expanded ? "Recolher" : "Expandir"} etapa ${stage.name}`}
            onClick={() => setExpanded((current) => !current)}
            className="grid size-9 place-items-center rounded-lg border border-on-brand/30 text-on-brand outline-none hover:bg-on-brand/10 focus-visible:ring-4 focus-visible:ring-on-brand/25"
          >
            <Icon name="chevronRight" className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        </div>
      </div>

      <div id={contentId} hidden={!expanded}>
        <div className="px-4 pb-5 pt-4 sm:px-5">
          {stage.description && <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted">{stage.description}</p>}

          <div className={`${stage.description ? "mt-4" : ""} grid gap-4 border-y border-line/70 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)] lg:items-center`}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-start gap-2.5">
                <Icon name="user" className="mt-0.5 size-4 shrink-0 text-brand" />
                <div><dt className="text-xs font-medium text-subtle">Responsável</dt><dd className="mt-1 text-sm text-strong">{projectStageResponsibleName(stage.responsible_user_id, members)}</dd></div>
              </div>
              <div className="flex items-start gap-2.5">
                <Icon name="calendar" className="mt-0.5 size-4 shrink-0 text-brand" />
                <div><dt className="text-xs font-medium text-subtle">Início planejado</dt><dd className="mt-1 text-sm text-strong">{formatProjectDate(stage.planned_start_date)}</dd></div>
              </div>
              <div className="flex items-start gap-2.5">
                <Icon name="clock" className="mt-0.5 size-4 shrink-0 text-brand" />
                <div><dt className="text-xs font-medium text-subtle">Término planejado</dt><dd className="mt-1 text-sm text-strong">{formatProjectDate(stage.planned_end_date)}</dd></div>
              </div>
            </dl>
            <div className="lg:border-l lg:border-line/70 lg:pl-5">
              <ProgressBar label={`Progresso da etapa ${stage.name}`} progress={progress} />
            </div>
          </div>

          {editable && (
            <div className="mt-4 flex flex-wrap items-start gap-2 lg:justify-end">
              <ProjectStageStatusActions status={stage.status} action={changeStageStatus.bind(null, stage.id)} />
              <ProjectStageReorder stageName={stage.name} canMoveUp={canMoveUp} canMoveDown={canMoveDown} action={reorderStage.bind(null, stage.id)} />
              <ProjectStageEdit stage={stage} members={members} action={updateStage.bind(null, stage.id)} />
              <ProjectStageArchive stageName={stage.name} action={archiveStage.bind(null, stage.id)} />
            </div>
          )}
        </div>
        <ProjectStageTasks stageName={stage.name} tasks={tasks} members={members} editable={editable} createTask={createTask.bind(null, stage.id)} />
      </div>
    </li>
  );
}

export function ProjectStages({
  result,
  members,
  projectStatus,
  createStage,
  updateStage,
  changeStageStatus,
  archiveStage,
  reorderStage,
  createTask,
}: {
  result: ProjectStagesResult;
  members: CrmMember[];
  projectStatus: ProjectStatus;
  createStage: (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  updateStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  changeStageStatus: (stageId: string, nextStatus: ProjectStageRecord["status"], state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  archiveStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  reorderStage: (stageId: string, direction: "up" | "down", state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  createTask: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
}) {
  const progressByStage = new Map(result.stageProgress.map((progress) => [progress.project_stage_id, progress]));
  const tasksByStage = groupProjectTasksByStage(result.tasks);
  const terminal = isTerminalProjectStatus(projectStatus);
  const empty = projectStagesAreEmpty(result.stages);

  return (
    <section aria-labelledby="project-stages-heading" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="project-stages-heading" className="text-base font-semibold text-strong">Etapas do projeto</h2>
          <p className="mt-1 text-sm text-muted">Acompanhe planejamento, responsáveis e execução em ordem operacional.</p>
        </div>
        {terminal ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-soft px-3 py-1 text-xs font-semibold text-muted">
            <Icon name="lock" className="size-3.5" /> Somente leitura
          </span>
        ) : <ProjectStageCreate action={createStage} members={members} />}
      </div>

      <div className="mt-5 rounded-xl border border-line bg-soft/35 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-strong">Progresso geral</p>
          <p className="text-xs text-subtle">{result.stages.length} {result.stages.length === 1 ? "etapa ativa" : "etapas ativas"}</p>
        </div>
        <ProgressBar label="Progresso geral do projeto" progress={result.projectProgress} />
      </div>

      {empty ? (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-soft/20 px-5 py-8 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon name="list" className="size-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-strong">Nenhuma etapa cadastrada</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Quando o planejamento operacional for estruturado, as etapas aparecerão aqui em ordem de execução.</p>
        </div>
      ) : (
        <ol className="mt-6 space-y-6">
          {result.stages.map((stage, index) => {
            const availability = projectStageReorderAvailability(index, result.stages.length);
            return <StageCard
              key={stage.id}
              stage={stage}
              members={members}
              editable={!terminal}
              updateStage={updateStage}
              changeStageStatus={changeStageStatus}
              archiveStage={archiveStage}
              reorderStage={reorderStage}
              canMoveUp={availability.canMoveUp}
              canMoveDown={availability.canMoveDown}
              tasks={tasksByStage.get(stage.id) ?? []}
              createTask={createTask}
              progress={progressByStage.get(stage.id) ?? {
                project_stage_id: stage.id,
                eligible_tasks: 0,
                completed_tasks: 0,
                progress_percent: 0,
              }}
            />;
          })}
        </ol>
      )}
    </section>
  );
}
