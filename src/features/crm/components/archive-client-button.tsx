"use client";

import { useActionState } from "react";
import { Icon } from "@/components/ui/icon";
import { FormMessage } from "@/features/crm/components/form-controls";
import type { ActionState } from "@/features/crm/types";
import { initialActionState } from "@/features/crm/types";

export function ArchiveClientButton({ action, disabled }: { action: (state: ActionState, payload: FormData) => Promise<ActionState>; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  if (disabled) return null;
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-danger/25 px-4 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60">
        <Icon name="archive" className="size-4" /> {pending ? "Arquivando..." : "Arquivar cliente"}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
