"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/features/crm/components/form-controls";
import {
  getProjectStageTransitions,
  projectStageTransitionLabel,
} from "@/features/projects/presentation";
import type { ProjectActionState, ProjectStageStatus } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type ChangeStageStatusAction = (
  nextStatus: ProjectStageStatus,
  state: ProjectActionState,
  formData: FormData,
) => Promise<ProjectActionState>;

function statusButtonClass(status: ProjectStageStatus) {
  const base = "inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-xs font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-60";
  if (status === "completed") return `${base} bg-positive-soft text-positive hover:brightness-95`;
  if (status === "skipped") return `${base} bg-warning-soft text-warning hover:brightness-95`;
  if (status === "in_progress") return `${base} bg-brand text-on-brand hover:bg-brand-strong`;
  return `${base} border border-line bg-surface text-muted hover:border-brand hover:text-brand`;
}

export function ProjectStageStatusActions({ status, action }: { status: ProjectStageStatus; action: ChangeStageStatusAction }) {
  const [state, setState] = useState<ProjectActionState>(initialProjectActionState);
  const [pendingStatus, setPendingStatus] = useState<ProjectStageStatus | null>(null);
  const [pending, startTransition] = useTransition();
  const transitions = getProjectStageTransitions(status);

  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-subtle">Alterar situação</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {transitions.map((nextStatus) => (
          <button
            key={nextStatus}
            type="button"
            disabled={pending}
            className={statusButtonClass(nextStatus)}
            onClick={() => {
              setPendingStatus(nextStatus);
              startTransition(async () => {
                const result = await action(nextStatus, initialProjectActionState, new FormData());
                setState(result);
                setPendingStatus(null);
              });
            }}
          >
            {pending && pendingStatus === nextStatus ? "Atualizando..." : projectStageTransitionLabel(status, nextStatus)}
          </button>
        ))}
      </div>
      {state.message && <div className="mt-2 max-w-xl"><FormMessage status={state.status} message={state.message} /></div>}
    </div>
  );
}
