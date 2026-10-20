import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import { createManualProjectAction, createProjectFromProposalAction } from "@/features/projects/actions";
import { ApprovedProposalPicker } from "@/features/projects/components/approved-proposal-picker";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getApprovedProposalChoices, getProjectFormOptions } from "@/features/projects/server/queries";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ proposal?: string | string[] }> }) {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const params = await searchParams;
  const requestedProposal = Array.isArray(params.proposal) ? params.proposal[0] : params.proposal;
  if (requestedProposal && !isUuid(requestedProposal)) notFound();
  const [options, proposals] = await Promise.all([
    getProjectFormOptions(context.supabase, context.organization.id, context.user),
    getApprovedProposalChoices(context.supabase, context.organization.id),
  ]);
  const proposal = requestedProposal ? proposals.find((item) => item.id === requestedProposal) : null;
  if (requestedProposal && !proposal) notFound();
  if (proposal?.existingProjectId) {
    return <><Link href="/projetos" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para projetos</Link><PageHeader eyebrow="Projeto já criado" title={proposal.title} description="Esta proposta já está vinculada a um projeto. A unicidade também é protegida no banco." /><Link href={`/projetos/${proposal.existingProjectId}`} className="inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand">Abrir projeto existente</Link></>;
  }
  return <>
    <Link href="/projetos" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para projetos</Link>
    <PageHeader eyebrow="Novo projeto" title={proposal ? "Confirmar dados da proposta" : "Como deseja criar?"} description={proposal ? "Revise os dados operacionais antes de criar. A proposta aprovada não será modificada." : "Cadastre manualmente ou aproveite uma proposta aprovada como origem contratual."} />
    {proposal ? <ProjectForm action={createProjectFromProposalAction.bind(null, proposal.id)} members={options.members} proposal={proposal} /> : <div className="space-y-6">
      <details open className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><summary className="cursor-pointer text-base font-semibold text-strong">Cadastro manual</summary><p className="mb-5 mt-1 text-sm text-muted">Informe cliente, escopo, responsável e prazo inicial.</p><ProjectForm action={createManualProjectAction} members={options.members} clients={options.clients} /></details>
      <section><div className="mb-4"><h2 className="text-base font-semibold text-strong">Criar a partir de proposta aprovada</h2><p className="mt-1 text-sm text-muted">O projeto preservará a revisão, a opção comercial e os itens efetivamente contratados.</p></div><ApprovedProposalPicker proposals={proposals} /></section>
    </div>}
  </>;
}
