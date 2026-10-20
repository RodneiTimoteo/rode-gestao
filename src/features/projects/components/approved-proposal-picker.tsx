import Link from "next/link";
import { formatProjectCurrency } from "@/features/projects/format";
import type { ApprovedProposalChoice } from "@/features/projects/types";

export function ApprovedProposalPicker({ proposals }: { proposals: ApprovedProposalChoice[] }) {
  if (!proposals.length) return <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center"><p className="font-semibold text-strong">Nenhuma proposta aprovada disponível</p><p className="mt-2 text-sm text-muted">Aprove uma proposta comercial para iniciar este fluxo.</p><Link href="/propostas" className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline">Ir para propostas</Link></div>;
  return <div className="grid gap-3">
    {proposals.map((proposal) => <article key={proposal.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{proposal.code} · R{proposal.revision_number}</p>{proposal.existingProjectId && <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-semibold text-positive">Projeto criado</span>}</div>
        <h3 className="mt-1 truncate font-semibold text-strong">{proposal.title}</h3>
        <p className="mt-1 text-sm text-muted">{proposal.clientName}{proposal.selectedOptionName ? ` · ${proposal.selectedOptionName}` : ""}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:text-right"><p className="text-sm font-semibold text-strong">{formatProjectCurrency(proposal.total_amount)}</p><Link href={proposal.existingProjectId ? `/projetos/${proposal.existingProjectId}` : `/projetos/novo?proposal=${proposal.id}`} className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong">{proposal.existingProjectId ? "Abrir projeto" : "Usar proposta"}</Link></div>
    </article>)}
  </div>;
}
