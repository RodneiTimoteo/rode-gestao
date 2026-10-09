"use client";

import { useActionState, useRef, useState } from "react";
import type { ProposalActionState, ProposalStatus } from "@/features/proposals/types";
import { FormMessage, textareaClassName } from "@/features/crm/components/form-controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const initialState: ProposalActionState = { status: "idle", message: "" };

function StatusForm({ label, action, confirmation, danger = false, children }: { label: string; action: (state: ProposalActionState, data: FormData) => Promise<ProposalActionState>; confirmation?: string; danger?: boolean; children?: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogTitle = danger ? "Confirmar ação crítica" : "Confirmar alteração de status";

  return <><form ref={formRef} action={formAction} onSubmit={(event) => { if (confirmation && !confirmed.current) { event.preventDefault(); setConfirming(true); return; } confirmed.current = false; }} className={children ? "rounded-xl border border-line p-3" : "inline-block"}>{children}<button disabled={pending} className={`${children ? "mt-3" : ""} inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${danger ? "bg-danger-soft text-danger hover:opacity-80" : "bg-brand text-on-brand hover:bg-brand-strong"}`}>{pending ? "Processando..." : label}</button>{state.message && <div className="mt-2"><FormMessage status={state.status} message={state.message} /></div>}</form>{confirmation && <ConfirmDialog open={confirming} title={dialogTitle} description={confirmation} confirmLabel={label} danger={danger} onCancel={() => setConfirming(false)} onConfirm={() => { confirmed.current = true; setConfirming(false); requestAnimationFrame(() => formRef.current?.requestSubmit()); }} />}</>;
}

export function ProposalActions({ status, canApprove, transition, revision }: {
  status: ProposalStatus; canApprove: boolean;
  transition: (nextStatus: ProposalStatus, state: ProposalActionState, data: FormData) => Promise<ProposalActionState>;
  revision: (state: ProposalActionState, data: FormData) => Promise<ProposalActionState>;
}) {
  if (["approved", "rejected", "expired", "cancelled"].includes(status)) return <StatusForm label="Criar nova revisão" confirmation="Criar uma nova revisão em rascunho a partir desta proposta?" action={revision} />;
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">
    {status === "draft" && <StatusForm label="Marcar como enviada" confirmation="Confirmar o envio desta proposta?" action={transition.bind(null, "sent")} />}
    {status === "sent" && <StatusForm label="Iniciar negociação" confirmation="Confirmar o início da negociação?" action={transition.bind(null, "negotiating")} />}
    {status === "negotiating" && <StatusForm label="Marcar como reenviada" confirmation="Confirmar o reenvio desta proposta?" action={transition.bind(null, "sent")} />}
    {canApprove && ["sent", "negotiating"].includes(status) && <StatusForm label="Aprovar proposta" confirmation="A aprovação torna esta proposta imutável. Deseja continuar?" action={transition.bind(null, "approved")} />}
    {["draft", "sent", "negotiating"].includes(status) && <StatusForm label="Cancelar" confirmation="Cancelar esta proposta? Esta ação encerra a versão atual." danger action={transition.bind(null, "cancelled")} />}
  </div>{["sent", "negotiating"].includes(status) && <details className="rounded-xl border border-line bg-soft/40 p-3"><summary className="cursor-pointer text-sm font-semibold text-danger">Rejeitar proposta</summary><div className="mt-3"><StatusForm label="Confirmar rejeição" confirmation="Rejeitar esta proposta com o motivo informado?" danger action={transition.bind(null, "rejected")}><label className="block text-sm font-medium text-strong" htmlFor="rejection_reason">Motivo obrigatório</label><textarea id="rejection_reason" name="rejection_reason" required maxLength={2000} className={`${textareaClassName} mt-1.5`} /></StatusForm></div></details>}</div>;
}
