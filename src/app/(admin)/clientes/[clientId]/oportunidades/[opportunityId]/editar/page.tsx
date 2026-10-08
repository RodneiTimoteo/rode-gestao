import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { updateOpportunityAction } from "@/features/crm/actions";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { OpportunityForm } from "@/features/crm/components/opportunity-form";
import { getCrmContext } from "@/features/crm/server/context";
import { getClientById, getCrmMembers, getOpportunityById, getPipelineStages } from "@/features/crm/server/queries";
import { isUuid } from "@/features/crm/validation";

export const metadata: Metadata = { title: "Editar oportunidade" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ clientId: string; opportunityId: string }> }) {
  const { clientId, opportunityId } = await params;
  if (!isUuid(clientId) || !isUuid(opportunityId)) notFound();
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const [client, opportunity, stages, members] = await Promise.all([
    getClientById(context.supabase, context.organization.id, clientId),
    getOpportunityById(context.supabase, context.organization.id, clientId, opportunityId),
    getPipelineStages(context.supabase, context.organization.id),
    getCrmMembers(context.supabase, context.organization.id, context.user),
  ]);
  if (!client || !opportunity) notFound();
  const action = updateOpportunityAction.bind(null, client.id, opportunity.id);
  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/clientes/${client.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para {client.name}</Link>
      <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Oportunidade comercial</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Editar {opportunity.title}</h1><p className="mt-2 text-sm text-muted">A etapa selecionada define automaticamente o resultado e a data de fechamento no banco.</p></header>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><OpportunityForm action={action} stages={stages} members={members} opportunity={opportunity} cancelHref={`/clientes/${client.id}`} /></section>
    </div>
  );
}
