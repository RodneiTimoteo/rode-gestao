"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FormMessage } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import { ProjectStageFields } from "@/features/projects/components/project-stage-fields";
import type { ProjectActionState, ProjectStageRecord } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type UpdateStageAction = (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;

function StageEditForm({ stage, members, action, onCancel, onSuccess, idPrefix }: {
  stage: ProjectStageRecord;
  members: CrmMember[];
  action: UpdateStageAction;
  onCancel: () => void;
  onSuccess: (message: string) => void;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [onSuccess, state]);

  return (
    <form action={formAction} aria-busy={pending} className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/40 p-4 sm:p-5">
      <input type="hidden" name="expected_updated_at" value={stage.updated_at} />
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-strong">Editar etapa</h4>
        <p className="mt-1 text-xs leading-5 text-muted">A situação operacional será preservada.</p>
      </div>
      <FormMessage status={state.status} message={state.message} />
      <div className={state.message ? "mt-4" : undefined}>
        <ProjectStageFields idPrefix={idPrefix} members={members} fieldErrors={state.fieldErrors} values={stage} autoFocusName />
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={pending} onClick={onCancel} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted outline-none hover:text-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-60">
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

export function ProjectStageEdit({ stage, members, action }: { stage: ProjectStageRecord; members: CrmMember[]; action: UpdateStageAction }) {
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<ProjectStageRecord | null>(null);
  const [feedback, setFeedback] = useState("");
  const formId = useId();

  if (!expanded) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button type="button" aria-expanded="false" aria-controls={formId} onClick={() => { setSnapshot(stage); setFeedback(""); setExpanded(true); }} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-muted outline-none hover:border-brand hover:text-brand focus-visible:ring-4 focus-visible:ring-brand-soft">
          <Icon name="edit" className="size-3.5" /> Editar
        </button>
        {feedback && <span role="status" className="text-xs font-medium text-positive">{feedback}</span>}
      </div>
    );
  }

  return snapshot ? (
    <div id={formId} className="w-full sm:basis-full">
      <StageEditForm
        stage={snapshot}
        members={members}
        action={action}
        onCancel={() => { setExpanded(false); setSnapshot(null); }}
        onSuccess={(message) => { setFeedback(message); setExpanded(false); setSnapshot(null); }}
        idPrefix={`${formId}-stage-edit`}
      />
    </div>
  ) : null;
}
