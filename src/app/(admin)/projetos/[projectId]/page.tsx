import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { FeedbackBanner } from "@/features/crm/components/feedback-banner";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { getCrmMembers } from "@/features/crm/server/queries";
import { isUuid } from "@/features/crm/validation";
import { assignProjectOwnerAction, changeProjectDeadlineAction, changeProjectStatusAction, createProjectStageAction } from "@/features/projects/actions";
import { ProjectActions } from "@/features/projects/components/project-actions";
import { ProjectHistory } from "@/features/projects/components/project-history";
import { ProjectStages } from "@/features/projects/components/project-stages";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { formatProjectCurrency, formatProjectDate } from "@/features/projects/format";
import { getProjectById, getProjectStages } from "@/features/projects/server/queries";

export const metadata: Metadata = { title: "Detalhes do projeto" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium text-subtle">{label}</dt><dd className="mt-1 text-sm text-strong">{children || "—"}</dd></div>;
}

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ success?: string | string[] }> }) {
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const [project, members, stages] = await Promise.all([
    getProjectById(context.supabase, context.organization.id, projectId, context.user),
    getCrmMembers(context.supabase, context.organization.id, context.user),
    getProjectStages(context.supabase, context.organization.id, projectId),
  ]);
  if (!project) notFound();
  const query = await searchParams;
  const success = Array.isArray(query.success) ? query.success[0] : query.success;
  const snapshotItems = project.proposal_snapshot?.items ?? [];
  return <>
    <Link href="/projetos" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para projetos</Link>
    <FeedbackBanner code={success} />
    <header className="mb-6"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Projeto</p><ProjectStatusBadge status={project.status} /></div><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">{project.name}</h1><p className="mt-2 text-sm text-muted">{project.clientName}</p></header>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,.8fr)]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-base font-semibold text-strong">Informações gerais</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Cliente"><Link href={`/clientes/${project.client_id}`} className="font-semibold text-brand hover:underline">{project.clientName}</Link></Detail><Detail label="Responsável">{project.ownerName}</Detail><Detail label="Valor contratado">{formatProjectCurrency(project.contracted_amount)}</Detail><Detail label="Data de início">{formatProjectDate(project.start_date)}</Detail><Detail label="Prazo original">{formatProjectDate(project.original_expected_end_date)}</Detail><Detail label="Prazo atual">{formatProjectDate(project.expected_end_date)}</Detail><Detail label="Conclusão efetiva">{formatProjectDate(project.completed_at, true)}</Detail><Detail label="Criado em">{formatProjectDate(project.created_at, true)}</Detail>{project.proposal && <Detail label="Proposta de origem"><Link href={`/propostas/${project.proposal.id}`} className="font-semibold text-brand hover:underline">{project.proposal.code} · Revisão {project.proposal.revision_number}</Link></Detail>}</dl>{project.description && <div className="mt-5 border-t border-line pt-5"><p className="text-xs font-medium text-subtle">Descrição ou escopo</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{project.description}</p></div>}</section>
        {project.proposal_snapshot && <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-semibold text-strong">Escopo contratado</h2><p className="mt-1 text-sm text-muted">Snapshot preservado no momento da criação.</p></div>{project.proposal_snapshot.selected_option && <span className="w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">{project.proposal_snapshot.selected_option.name}</span>}</div>{snapshotItems.length ? <div className="mt-4 divide-y divide-line">{snapshotItems.map((item) => <div key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-strong">{item.service_name}</p><p className="mt-0.5 text-sm text-muted">{item.description}</p></div><p className="shrink-0 text-sm font-semibold text-strong">{formatProjectCurrency(item.line_total)}</p></div>)}</div> : <p className="mt-4 text-sm text-muted">A proposta não possui itens no snapshot.</p>}</section>}
        <ProjectStages result={stages} members={members} projectStatus={project.status} createStage={createProjectStageAction.bind(null, project.id)} />
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-base font-semibold text-strong">Histórico</h2><div className="mt-5"><ProjectHistory events={project.events} /></div></section>
      </div>
      <aside><section className="sticky top-5 rounded-2xl border border-line bg-surface p-5"><h2 className="text-base font-semibold text-strong">Ações do projeto</h2><p className="mb-5 mt-1 text-sm text-muted">As regras são validadas novamente no servidor e no banco.</p><ProjectActions status={project.status} members={members} ownerUserId={project.owner_user_id} expectedEndDate={project.expected_end_date} transition={changeProjectStatusAction.bind(null, project.id, project.status)} assignOwner={assignProjectOwnerAction.bind(null, project.id)} changeDeadline={changeProjectDeadlineAction.bind(null, project.id)} /></section></aside>
    </div>
  </>;
}
