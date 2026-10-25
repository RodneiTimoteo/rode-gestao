"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { FormMessage } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import { ProjectTaskFields } from "@/features/projects/components/project-task-fields";
import type { ProjectActionState } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type CreateTaskAction = (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;

function TaskCreateForm({ action, members, idPrefix, onCancel }: {
  action: CreateTaskAction;
  members: CrmMember[];
  idPrefix: string;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-3 w-full rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
      <div className="mb-4">
        <h5 className="text-sm font-semibold text-strong">Nova tarefa</h5>
        <p className="mt-1 text-xs leading-5 text-muted">A tarefa será adicionada ao final desta etapa com situação “A fazer”.</p>
      </div>
      <FormMessage status={state.status} message={state.message} />
      <div className={state.message ? "mt-4" : undefined}>
        <ProjectTaskFields idPrefix={idPrefix} members={members} fieldErrors={state.fieldErrors} />
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={pending} onClick={onCancel} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted outline-none hover:text-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-60">
          {pending ? "Criando tarefa..." : "Criar tarefa"}
        </button>
      </div>
    </form>
  );
}

export function ProjectTaskCreate({ action, members }: { action: CreateTaskAction; members: CrmMember[] }) {
  const [expanded, setExpanded] = useState(false);
  const formId = useId();

  if (!expanded) {
    return (
      <button type="button" aria-expanded="false" aria-controls={formId} onClick={() => setExpanded(true)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-brand/35 bg-surface px-3 text-xs font-semibold text-brand outline-none hover:bg-brand-soft focus-visible:ring-4 focus-visible:ring-brand-soft">
        <Icon name="plus" className="size-3.5" /> Nova tarefa
      </button>
    );
  }

  return <div id={formId} className="w-full basis-full"><TaskCreateForm action={action} members={members} idPrefix={`task-create-${formId.replace(/:/g, "")}`} onCancel={() => setExpanded(false)} /></div>;
}
