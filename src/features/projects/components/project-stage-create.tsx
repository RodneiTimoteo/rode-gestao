"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import type { ProjectActionState } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type CreateStageAction = (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;

function StageCreateForm({ action, members, onCancel }: { action: CreateStageAction; members: CrmMember[]; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/40 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-strong">Nova etapa</h3>
        <p className="mt-1 text-xs leading-5 text-muted">A etapa será adicionada ao final da ordem atual.</p>
      </div>
      <FormMessage status={state.status} message={state.message} />
      <div className={`${state.message ? "mt-4 " : ""}grid gap-4 md:grid-cols-2`}>
        <Field label="Nome da etapa *" htmlFor="stage_name" error={state.fieldErrors?.name}>
          <input autoFocus className={inputClassName} id="stage_name" name="name" required minLength={1} maxLength={200} />
        </Field>
        <Field label="Responsável" htmlFor="stage_responsible_user_id" error={state.fieldErrors?.responsible_user_id}>
          <select className={inputClassName} id="stage_responsible_user_id" name="responsible_user_id" defaultValue="">
            <option value="">Não atribuído</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Descrição" htmlFor="stage_description" error={state.fieldErrors?.description} hint="Opcional. Até 8.000 caracteres.">
            <textarea className={`${textareaClassName} min-h-24`} id="stage_description" name="description" maxLength={8000} placeholder="Descreva o objetivo e as entregas desta etapa." />
          </Field>
        </div>
        <Field label="Data inicial planejada" htmlFor="stage_planned_start_date" error={state.fieldErrors?.planned_start_date}>
          <input className={inputClassName} id="stage_planned_start_date" name="planned_start_date" type="date" />
        </Field>
        <Field label="Data final planejada" htmlFor="stage_planned_end_date" error={state.fieldErrors?.planned_end_date}>
          <input className={inputClassName} id="stage_planned_end_date" name="planned_end_date" type="date" />
        </Field>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={pending} onClick={onCancel} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted outline-none hover:text-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand-strong focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-60">
          {pending ? "Criando etapa..." : "Criar etapa"}
        </button>
      </div>
    </form>
  );
}

export function ProjectStageCreate({ action, members }: { action: CreateStageAction; members: CrmMember[] }) {
  const [expanded, setExpanded] = useState(false);
  const formId = useId();

  if (!expanded) {
    return (
      <button type="button" aria-expanded="false" aria-controls={formId} onClick={() => setExpanded(true)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand outline-none hover:bg-brand-strong focus-visible:ring-4 focus-visible:ring-brand-soft sm:w-auto">
        <Icon name="plus" className="size-4" /> Nova etapa
      </button>
    );
  }

  return <div id={formId} className="w-full sm:basis-full"><StageCreateForm action={action} members={members} onCancel={() => setExpanded(false)} /></div>;
}
