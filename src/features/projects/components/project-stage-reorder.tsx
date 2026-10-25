"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { FormMessage } from "@/features/crm/components/form-controls";
import type { ProjectActionState, ProjectStageReorderDirection } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type ReorderStageAction = (
  direction: ProjectStageReorderDirection,
  state: ProjectActionState,
  formData: FormData,
) => Promise<ProjectActionState>;

export function ProjectStageReorder({ stageName, canMoveUp, canMoveDown, action }: {
  stageName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  action: ReorderStageAction;
}) {
  const [state, setState] = useState<ProjectActionState>(initialProjectActionState);
  const [pendingDirection, setPendingDirection] = useState<ProjectStageReorderDirection | null>(null);
  const [pending, startTransition] = useTransition();

  const move = (direction: ProjectStageReorderDirection) => {
    setState(initialProjectActionState);
    setPendingDirection(direction);
    startTransition(async () => {
      const result = await action(direction, initialProjectActionState, new FormData());
      setState(result);
      setPendingDirection(null);
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div role="group" aria-label={`Reordenar etapa ${stageName}`} aria-busy={pending} className="inline-flex overflow-hidden rounded-xl border border-line bg-surface">
        <button
          type="button"
          disabled={!canMoveUp || pending}
          aria-label={`Mover ${stageName} para cima`}
          title="Mover para cima"
          onClick={() => move("up")}
          className="grid size-9 place-items-center text-muted outline-none hover:bg-soft hover:text-brand focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:text-disabled"
        >
          <Icon name="arrowUp" className="size-4" />
        </button>
        <button
          type="button"
          disabled={!canMoveDown || pending}
          aria-label={`Mover ${stageName} para baixo`}
          title="Mover para baixo"
          onClick={() => move("down")}
          className="grid size-9 place-items-center border-l border-line text-muted outline-none hover:bg-soft hover:text-brand focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:text-disabled"
        >
          <Icon name="arrowUp" className="size-4 rotate-180" />
        </button>
      </div>
      {pending && <span role="status" className="text-xs font-medium text-muted">Movendo {pendingDirection === "up" ? "para cima" : "para baixo"}...</span>}
      {state.message && <div className="max-w-sm"><FormMessage status={state.status} message={state.message} /></div>}
    </div>
  );
}
