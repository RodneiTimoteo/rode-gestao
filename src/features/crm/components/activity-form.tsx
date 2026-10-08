"use client";

import { useActionState } from "react";
import { activityTypeLabels, activityTypes } from "@/features/crm/constants";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { ActionState, OpportunityRecord } from "@/features/crm/types";
import { initialActionState } from "@/features/crm/types";

export function ActivityForm({ action, opportunities }: { action: (state: ActionState, payload: FormData) => Promise<ActionState>; opportunities: OpportunityRecord[] }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo *" htmlFor="activity_type" error={state.fieldErrors?.activity_type}>
          <select className={inputClassName} id="activity_type" name="activity_type" defaultValue="note" required>
            {activityTypes.map((type) => <option key={type} value={type}>{activityTypeLabels[type]}</option>)}
          </select>
        </Field>
        <Field label="Oportunidade relacionada" htmlFor="opportunity_id" error={state.fieldErrors?.opportunity_id}>
          <select className={inputClassName} id="opportunity_id" name="opportunity_id" defaultValue="">
            <option value="">Nenhuma</option>
            {opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Data e hora" htmlFor="occurred_at" error={state.fieldErrors?.occurred_at} hint="Deixe em branco para registrar agora.">
            <input className={inputClassName} id="occurred_at" name="occurred_at" type="datetime-local" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Descrição *" htmlFor="description" error={state.fieldErrors?.description}>
            <textarea className={textareaClassName} id="description" name="description" required maxLength={4000} placeholder="Registre os pontos importantes da interação." />
          </Field>
        </div>
      </div>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60">
        {pending ? "Registrando..." : "Registrar atividade"}
      </button>
    </form>
  );
}
