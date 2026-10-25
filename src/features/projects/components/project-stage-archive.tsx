"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { FormMessage } from "@/features/crm/components/form-controls";
import type { ProjectActionState } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";

type ArchiveStageAction = (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;

export function ProjectStageArchive({ stageName, action }: { stageName: string; action: ArchiveStageAction }) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ProjectActionState>(initialProjectActionState);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-danger/20 bg-danger-soft px-3 text-xs font-semibold text-danger outline-none hover:brightness-95 focus-visible:ring-4 focus-visible:ring-danger/10 disabled:cursor-wait disabled:opacity-60"
      >
        <Icon name="archive" className="size-3.5" /> {pending ? "Arquivando..." : "Arquivar"}
      </button>
      {state.message && <div className="max-w-sm"><FormMessage status={state.status} message={state.message} /></div>}
      <ConfirmDialog
        open={confirming}
        title={`Arquivar ${stageName}`}
        description="A etapa será removida da lista de etapas ativas. As tarefas e o histórico serão preservados: este arquivamento não é uma exclusão definitiva. Não existe funcionalidade de restauração nesta etapa."
        confirmLabel="Arquivar etapa"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          startTransition(async () => {
            const formData = new FormData();
            formData.set("confirmation", "archive-project-stage");
            const result = await action(initialProjectActionState, formData);
            setState(result);
          });
        }}
      />
    </div>
  );
}
