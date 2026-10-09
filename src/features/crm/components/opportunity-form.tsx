"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { ActionState, CrmMember, OpportunityRecord, PipelineStage } from "@/features/crm/types";
import { initialActionState } from "@/features/crm/types";

type Props = {
  action: (state: ActionState, payload: FormData) => Promise<ActionState>;
  stages: PipelineStage[];
  members: CrmMember[];
  opportunity?: OpportunityRecord;
  cancelHref: string;
  compact?: boolean;
};

export function OpportunityForm({ action, stages, members, opportunity, cancelHref, compact = false }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [stageId, setStageId] = useState(opportunity?.pipeline_stage_id ?? stages[0]?.id ?? "");
  const selectedStage = stages.find((stage) => stage.id === stageId);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <div className={`grid gap-4 ${compact ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
        <Field label="Título *" htmlFor="title" error={state.fieldErrors?.title}>
          <input className={inputClassName} id="title" name="title" defaultValue={opportunity?.title} required maxLength={180} />
        </Field>
        <Field label="Serviço de interesse" htmlFor="service_interest">
          <input className={inputClassName} id="service_interest" name="service_interest" defaultValue={opportunity?.service_interest ?? ""} maxLength={200} />
        </Field>
        <Field label="Etapa *" htmlFor="pipeline_stage_id" error={state.fieldErrors?.pipeline_stage_id}>
          <select className={inputClassName} id="pipeline_stage_id" name="pipeline_stage_id" value={stageId} onChange={(event) => setStageId(event.target.value)} required>
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </Field>
        <Field label="Responsável" htmlFor="owner_user_id" error={state.fieldErrors?.owner_user_id}>
          <select className={inputClassName} id="owner_user_id" name="owner_user_id" defaultValue={opportunity?.owner_user_id ?? ""}>
            <option value="">Não atribuído</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
          </select>
        </Field>
        <Field label="Valor estimado" htmlFor="estimated_value" error={state.fieldErrors?.estimated_value}>
          <input className={inputClassName} id="estimated_value" name="estimated_value" inputMode="decimal" defaultValue={opportunity?.estimated_value?.toString() ?? ""} placeholder="0,00" />
        </Field>
        <Field label="Previsão de fechamento" htmlFor="expected_close_date" error={state.fieldErrors?.expected_close_date}>
          <input className={inputClassName} id="expected_close_date" name="expected_close_date" type="date" defaultValue={opportunity?.expected_close_date ?? ""} />
        </Field>
      </div>
      {selectedStage?.outcome === "lost" && (
        <Field label="Motivo da perda *" htmlFor="lost_reason" error={state.fieldErrors?.lost_reason}>
          <textarea className={textareaClassName} id="lost_reason" name="lost_reason" defaultValue={opportunity?.lost_reason ?? ""} required maxLength={1000} />
        </Field>
      )}
      <Field label="Observações" htmlFor="opportunity_notes"><textarea className={textareaClassName} id="opportunity_notes" name="notes" defaultValue={opportunity?.notes ?? ""} maxLength={4000} /></Field>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-5 text-sm font-semibold text-muted hover:bg-soft">Cancelar</Link>
        <button type="submit" disabled={pending || !stages.length} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60">
          {pending ? "Salvando..." : opportunity ? "Salvar oportunidade" : "Criar oportunidade"}
        </button>
      </div>
    </form>
  );
}
