"use client";

import { useActionState, useId, useState } from "react";
import { FormMessage, inputClassName } from "@/features/crm/components/form-controls";
import type { ActionState, PipelineStage } from "@/features/crm/types";
import { initialActionState } from "@/features/crm/types";

export function OpportunityStageForm({ action, stages, currentStageId }: { action: (state: ActionState, payload: FormData) => Promise<ActionState>; stages: PipelineStage[]; currentStageId: string }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [stageId, setStageId] = useState(currentStageId);
  const selectId = useId();
  const selected = stages.find((stage) => stage.id === stageId);
  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line pt-3">
      <label className="sr-only" htmlFor={selectId}>Mover oportunidade</label>
      <select id={selectId} className={`${inputClassName} h-9 text-xs`} name="pipeline_stage_id" value={stageId} onChange={(event) => setStageId(event.target.value)} disabled={pending}>
        {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </select>
      {selected?.outcome === "lost" && <input className={`${inputClassName} h-9 text-xs`} name="lost_reason" placeholder="Motivo da perda *" required maxLength={1000} />}
      <button type="submit" disabled={pending || stageId === currentStageId} className="h-9 w-full rounded-lg bg-soft px-3 text-xs font-semibold text-strong hover:bg-brand-soft hover:text-brand disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Movendo..." : "Mover para etapa"}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
