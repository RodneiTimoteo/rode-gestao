import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { archiveClientAction, createActivityAction, createOpportunityAction } from "@/features/crm/actions";
import { ActivityForm } from "@/features/crm/components/activity-form";
import { ActivityTimeline } from "@/features/crm/components/activity-timeline";
import { ArchiveClientButton } from "@/features/crm/components/archive-client-button";
import { FeedbackBanner } from "@/features/crm/components/feedback-banner";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { OpportunityForm } from "@/features/crm/components/opportunity-form";
import { OpportunityList } from "@/features/crm/components/opportunity-list";
import { ClientStatusBadge } from "@/features/crm/components/status-badges";
import { clientKindLabels } from "@/features/crm/constants";
import { formatDate, whatsappHref } from "@/features/crm/format";
import { getCrmContext } from "@/features/crm/server/context";
import { getClientActivities, getClientById, getClientOpportunities, getCrmMembers, getPipelineStages } from "@/features/crm/server/queries";
import { isUuid } from "@/features/crm/validation";

export const metadata: Metadata = { title: "Detalhes do cliente" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-subtle">{label}</dt><dd className="mt-1 text-sm text-strong">{children || "—"}</dd></div>;
}

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ success?: string | string[] }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const client = await getClientById(context.supabase, context.organization.id, clientId);
  if (!client) notFound();
  const [members, stages, opportunities] = await Promise.all([
    getCrmMembers(context.supabase, context.organization.id, context.user),
    getPipelineStages(context.supabase, context.organization.id),
    getClientOpportunities(context.supabase, context.organization.id, client.id),
  ]);
  const activities = await getClientActivities(context.supabase, context.organization.id, client.id, members, opportunities);
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  const query = await searchParams;
  const success = Array.isArray(query.success) ? query.success[0] : query.success;
  const whatsapp = client.whatsapp ? whatsappHref(client.whatsapp) : null;
  const createOpportunity = createOpportunityAction.bind(null, client.id);
  const createActivity = createActivityAction.bind(null, client.id);
  const archiveClient = archiveClientAction.bind(null, client.id);

  return (
    <>
      <Link href="/clientes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para clientes</Link>
      <FeedbackBanner code={success} />
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{clientKindLabels[client.kind]}</p><ClientStatusBadge status={client.status} /></div><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">{client.name}</h1><p className="mt-2 text-sm text-muted">{client.legal_name ?? client.segment ?? "Relacionamento comercial"}</p></div>
        <div className="flex flex-wrap gap-2"><Link href={`/clientes/${client.id}/editar`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-soft"><Icon name="edit" className="size-4" /> Editar</Link>{client.email && <a href={`mailto:${client.email}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted hover:bg-soft"><Icon name="mail" className="size-4" /> E-mail</a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Icon name="message" className="size-4" /> WhatsApp</a>}</div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-strong">Dados do cliente</h2><p className="mt-1 text-sm text-muted">Informações cadastrais e de contato.</p></div><Icon name={client.kind === "company" ? "building" : "user"} className="size-5 text-brand" /></div>
            <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="CPF / CNPJ">{client.tax_id}</Detail><Detail label="Responsável">{client.responsible_name}</Detail><Detail label="Contato">{client.contact_name}</Detail><Detail label="E-mail">{client.email}</Detail><Detail label="Telefone">{client.phone}</Detail><Detail label="WhatsApp">{client.whatsapp}</Detail><Detail label="Segmento">{client.segment}</Detail><Detail label="Localização">{[client.city, client.state, client.country].filter(Boolean).join(" · ")}</Detail><Detail label="Origem">{client.source}</Detail><Detail label="Responsável interno">{client.assigned_to ? memberNames.get(client.assigned_to) ?? "Membro" : null}</Detail><Detail label="Cadastrado em">{formatDate(client.created_at)}</Detail><Detail label="Atualizado em">{formatDate(client.updated_at)}</Detail>
            </dl>
            {client.notes && <div className="mt-5 border-t border-line pt-5"><p className="text-xs font-medium text-subtle">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{client.notes}</p></div>}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-strong">Oportunidades</h2><p className="mt-1 text-sm text-muted">Negociações independentes vinculadas a este cliente.</p></div><span className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-muted">{opportunities.length}</span></div>
            <OpportunityList clientId={client.id} opportunities={opportunities} stages={stages} members={members} />
            <details className="group mt-4 rounded-xl border border-line bg-soft/50 p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-brand">+ Nova oportunidade</summary><div className="mt-5"><OpportunityForm action={createOpportunity} stages={stages} members={members} cancelHref={`/clientes/${client.id}`} compact /></div></details>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="mb-5"><h2 className="text-base font-semibold text-strong">Histórico de atividades</h2><p className="mt-1 text-sm text-muted">Linha do tempo de contatos e interações comerciais.</p></div>
            <ActivityTimeline activities={activities} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="text-base font-semibold text-strong">Registrar atividade</h2><p className="mt-1 text-sm text-muted">Inclua uma interação no histórico.</p><div className="mt-5"><ActivityForm action={createActivity} opportunities={opportunities} /></div></section>
          <section className="rounded-2xl border border-line bg-surface p-5"><h2 className="text-base font-semibold text-strong">Ações do cadastro</h2><p className="mb-4 mt-1 text-sm leading-6 text-muted">Arquivar mantém o histórico e altera o status para inativo.</p><ArchiveClientButton action={archiveClient} disabled={client.status === "inactive"} /></section>
        </aside>
      </div>
    </>
  );
}
