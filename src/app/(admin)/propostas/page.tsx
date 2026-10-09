import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { inputClassName } from "@/features/crm/components/form-controls";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { proposalStatusLabels, proposalStatuses } from "@/features/proposals/constants";
import { ProposalList } from "@/features/proposals/components/proposal-list";
import { formatCurrency } from "@/features/proposals/format";
import { getProposalIndicators, getProposals } from "@/features/proposals/server/queries";
import type { ProposalFilters, ProposalStatus } from "@/features/proposals/types";

export const metadata: Metadata = { title: "Propostas" };
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const params = await searchParams;
  const status = first(params.status);
  const page = Number(first(params.page) ?? "1");
  const filters: ProposalFilters = {
    query: (first(params.q) ?? "").trim().slice(0, 80),
    status: status && proposalStatuses.includes(status as ProposalStatus) ? status as ProposalStatus : "all",
    sort: first(params.sort) === "created" ? "created" : "updated",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 10000) : 1,
  };
  const [result, indicators] = await Promise.all([getProposals(context.supabase, context.organization.id, filters), getProposalIndicators(context.supabase, context.organization.id)]);
  const cards = [["Total de propostas", String(indicators.total)], ["Enviadas / negociação", String(indicators.active)], ["Aprovadas", String(indicators.approved)], ["Valor total aprovado", formatCurrency(indicators.approvedValue)]];
  return <>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Comercial · {context.organization.name}</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Propostas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Acompanhe valores propostos, negociações e aprovações sem misturar receita recebida.</p></div><Link href="/propostas/nova" className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Icon name="plus" className="size-4" /> Nova proposta</Link></header>
    <section aria-label="Indicadores" className="my-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-medium text-subtle">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-strong">{value}</p></article>)}</section>
    <form role="search" className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]"><label className="relative"><span className="sr-only">Pesquisar</span><Icon name="search" className="pointer-events-none absolute left-3 top-3.5 size-4 text-subtle" /><input type="search" name="q" defaultValue={filters.query} placeholder="Cliente, código ou título" className={`${inputClassName} pl-9`} /></label><label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status} className={inputClassName}><option value="all">Todos os status</option>{proposalStatuses.map((item) => <option key={item} value={item}>{proposalStatusLabels[item]}</option>)}</select></label><label><span className="sr-only">Ordenação</span><select name="sort" defaultValue={filters.sort} className={inputClassName}><option value="updated">Atualizadas recentemente</option><option value="created">Criadas recentemente</option></select></label><button className="h-11 rounded-xl border border-line bg-soft px-4 text-sm font-semibold text-strong hover:bg-brand-soft hover:text-brand">Aplicar</button></form>
    <ProposalList result={result} filters={filters} />
  </>;
}
