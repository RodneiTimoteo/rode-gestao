import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { moveOpportunityAction } from "@/features/crm/actions";
import { CrmNavigation } from "@/features/crm/components/crm-navigation";
import { KanbanBoard } from "@/features/crm/components/kanban-board";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { getCrmMembers, getKanbanOpportunities, getPipelineStages } from "@/features/crm/server/queries";

export const metadata: Metadata = { title: "Funil comercial" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = rawView === "list" ? "list" : "board";
  const [members, stages] = await Promise.all([
    getCrmMembers(context.supabase, context.organization.id, context.user),
    getPipelineStages(context.supabase, context.organization.id),
  ]);
  const opportunities = await getKanbanOpportunities(context.supabase, context.organization.id, members);
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">CRM · {context.organization.name}</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Funil comercial</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Acompanhe as oportunidades pelas etapas configuradas no banco.</p></div>
        <Link href="/clientes" className="inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-soft"><Icon name="plus" className="size-4" /> Criar pelo cliente</Link>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><CrmNavigation active="pipeline" /><div className="flex w-fit rounded-xl border border-line bg-surface p-1"><Link href="/clientes/funil" aria-current={view === "board" ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${view === "board" ? "bg-brand-soft text-brand" : "text-muted"}`}><Icon name="columns" className="size-4" /> Kanban</Link><Link href="/clientes/funil?view=list" aria-current={view === "list" ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${view === "list" ? "bg-brand-soft text-brand" : "text-muted"}`}><Icon name="list" className="size-4" /> Lista</Link></div></div>
      <KanbanBoard opportunities={opportunities} stages={stages} moveAction={moveOpportunityAction} view={view} />
    </>
  );
}
