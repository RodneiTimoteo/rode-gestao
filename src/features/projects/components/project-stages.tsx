import { Icon } from "@/components/ui/icon";
import type { CrmMember } from "@/features/crm/types";
import { projectStageStatusLabels, projectStageStatusStyles } from "@/features/projects/constants";
import { ProjectStageCreate } from "@/features/projects/components/project-stage-create";
import { ProjectStageEdit } from "@/features/projects/components/project-stage-edit";
import { formatProjectDate } from "@/features/projects/format";
import {
  isTerminalProjectStatus,
  normalizeProgressPercent,
  projectStageResponsibleName,
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
}: {
  stage: ProjectStageRecord;
  progress: ProjectStageProgress;
  members: CrmMember[];
  editable: boolean;
  updateStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
}) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-xs font-semibold text-brand" aria-label={`Posição ${stage.position}`}>
              {stage.position}
            </span>
            <h3 className="break-words text-sm font-semibold text-strong sm:text-base">{stage.name}</h3>
          </div>
          {stage.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{stage.description}</p>}
        </div>
        <StageStatusBadge status={stage.status} />
      </div>

      {editable && <div className="mt-3 flex justify-end"><ProjectStageEdit stage={stage} members={members} action={updateStage.bind(null, stage.id)} /></div>}

      <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-subtle">Responsável</dt>
          <dd className="mt-1 text-sm text-strong">{projectStageResponsibleName(stage.responsible_user_id, members)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-subtle">Início planejado</dt>
          <dd className="mt-1 text-sm text-strong">{formatProjectDate(stage.planned_start_date)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-subtle">Término planejado</dt>
          <dd className="mt-1 text-sm text-strong">{formatProjectDate(stage.planned_end_date)}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl bg-soft/60 p-3">
        <ProgressBar label={`Progresso da etapa ${stage.name}`} progress={progress} />
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
}: {
  result: ProjectStagesResult;
  members: CrmMember[];
  projectStatus: ProjectStatus;
  createStage: (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  updateStage: (stageId: string, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
}) {
  const progressByStage = new Map(result.stageProgress.map((progress) => [progress.project_stage_id, progress]));
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
        <ol className="mt-5 space-y-3">
          {result.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              members={members}
              editable={!terminal}
              updateStage={updateStage}
              progress={progressByStage.get(stage.id) ?? {
                project_stage_id: stage.id,
                eligible_tasks: 0,
                completed_tasks: 0,
                progress_percent: 0,
              }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
