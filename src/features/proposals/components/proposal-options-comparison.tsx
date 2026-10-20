"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/features/crm/components/form-controls";
import { formatCurrency } from "@/features/proposals/format";
import type { ProposalActionState, ProposalItem, ProposalOptionView, ProposalStatus } from "@/features/proposals/types";

const idleState: ProposalActionState = { status: "idle", message: "" };

function ItemList({ items, emptyMessage }: { items: ProposalItem[]; emptyMessage: string }) {
  if (!items.length) return <p className="mt-3 text-sm text-subtle">{emptyMessage}</p>;
  return <ul className="mt-3 divide-y divide-line">{items.map((item) => <li key={item.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
    <div className="min-w-0"><p className="text-sm font-medium text-strong">{item.service_name_snapshot}</p><p className="mt-1 text-xs leading-5 text-muted">{item.description}</p><p className="mt-1 text-xs text-subtle">{Number(item.quantity).toLocaleString("pt-BR")} × {formatCurrency(item.unit_price)}{Number(item.discount_amount) > 0 ? ` · desconto ${formatCurrency(item.discount_amount)}` : ""}</p></div>
    <span className="shrink-0 text-sm font-semibold text-strong">{formatCurrency(item.line_total)}</span>
  </li>)}</ul>;
}

export function ProposalOptionsComparison({ options, commonItems, selectedOptionId, status, canApprove, selectAction, approveAction }: {
  options: ProposalOptionView[];
  commonItems: ProposalItem[];
  selectedOptionId: string | null;
  status: ProposalStatus;
  canApprove: boolean;
  selectAction: (optionId: string, state: ProposalActionState) => Promise<ProposalActionState>;
  approveAction: (optionId: string, state: ProposalActionState) => Promise<ProposalActionState>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ProposalActionState>(idleState);
  const [confirmation, setConfirmation] = useState<{ type: "select" | "approve"; option: ProposalOptionView } | null>(null);
  const selectionAllowed = status === "sent" || status === "negotiating";

  const runConfirmedAction = () => {
    if (!confirmation) return;
    const current = confirmation;
    setConfirmation(null);
    setState(idleState);
    startTransition(async () => {
      const result = current.type === "select"
        ? await selectAction(current.option.id, idleState)
        : await approveAction(current.option.id, idleState);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-strong">Comparação de alternativas</h2><p className="mt-1 text-sm text-muted">Os valores são independentes e já incluem os itens comuns.</p></div><span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold text-muted">{options.length} opções</span></div>
      {state.message && <div className="mt-4"><FormMessage status={state.status} message={state.message} /></div>}
      <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{options.map((option) => {
        const selected = option.id === selectedOptionId;
        return <article key={option.id} className={`flex min-w-0 flex-col rounded-2xl border p-4 sm:p-5 ${selected ? "border-brand bg-brand-soft/30 shadow-[var(--shadow-sm)]" : "border-line bg-soft/20"}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Alternativa {option.position}</p><h3 className="mt-2 text-lg font-semibold text-strong">{option.name}</h3></div>{selected && <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand">Selecionada</span>}</div>
          {option.description && <p className="mt-3 text-sm leading-6 text-muted">{option.description}</p>}
          <div className="mt-4 border-t border-line pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-subtle">Itens exclusivos</p><ItemList items={option.items} emptyMessage="Nenhum item exclusivo registrado." /></div>
          <dl className="mt-auto space-y-2 border-t border-line pt-4 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-medium text-strong">{formatCurrency(option.subtotal_amount)}</dd></div><div className="flex justify-between"><dt className="text-muted">Descontos</dt><dd className="font-medium text-danger">− {formatCurrency(option.discount_amount)}</dd></div><div className="flex justify-between border-t border-line pt-2"><dt className="font-semibold text-strong">Total da opção</dt><dd className="text-lg font-semibold text-brand">{formatCurrency(option.total_amount)}</dd></div></dl>
          {selectionAllowed && <div className="mt-4 grid gap-2">
            {!selected && <button type="button" disabled={pending} onClick={() => setConfirmation({ type: "select", option })} className="h-10 rounded-xl border border-brand/40 bg-surface px-4 text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-50">Selecionar esta opção</button>}
            {selected && canApprove && <button type="button" disabled={pending} onClick={() => setConfirmation({ type: "approve", option })} className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-50">Aprovar com esta opção</button>}
          </div>}
        </article>;
      })}</div>
      {!selectionAllowed && status !== "approved" && <p className="mt-4 rounded-xl bg-soft px-4 py-3 text-xs text-muted">A seleção fica disponível quando a proposta estiver enviada ou em negociação.</p>}
      {selectionAllowed && !canApprove && selectedOptionId && <p className="mt-4 text-xs text-subtle">A opção está selecionada. A aprovação é exclusiva de owner e admin.</p>}
    </section>

    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-base font-semibold text-strong">Itens incluídos em todas as opções</h2><p className="mt-1 text-sm text-muted">Estes itens compõem o cálculo oficial de cada alternativa.</p><ItemList items={commonItems} emptyMessage="Esta proposta não possui itens comuns." /></section>

    <ConfirmDialog
      open={confirmation !== null}
      title={confirmation?.type === "approve" ? "Confirmar aprovação comercial" : "Confirmar escolha comercial"}
      description={confirmation ? (confirmation.type === "approve"
        ? `Aprovar a proposta com ${confirmation.option.name} — ${formatCurrency(confirmation.option.total_amount)}? A proposta ficará imutável.`
        : `Registrar ${confirmation.option.name} — ${formatCurrency(confirmation.option.total_amount)} como a opção selecionada?`) : ""}
      confirmLabel={confirmation?.type === "approve" ? "Aprovar proposta" : "Selecionar opção"}
      onCancel={() => setConfirmation(null)}
      onConfirm={runConfirmedAction}
    />
  </div>;
}
