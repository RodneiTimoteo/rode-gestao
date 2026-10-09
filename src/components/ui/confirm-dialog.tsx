"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui/icon";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); onCancel(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-elevated p-0 text-strong shadow-[var(--shadow-md)]">
      <div className="p-5 sm:p-6">
        <div className={`grid size-11 place-items-center rounded-xl ${danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}><Icon name={danger ? "close" : "check"} className="size-5" /></div>
        <h2 id={titleId} className="mt-4 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" autoFocus onClick={onCancel} className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-soft">Voltar</button>
          <button type="button" onClick={onConfirm} className={`h-10 rounded-xl px-4 text-sm font-semibold ${danger ? "bg-danger text-white hover:opacity-90" : "bg-brand text-on-brand hover:bg-brand-strong"}`}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
