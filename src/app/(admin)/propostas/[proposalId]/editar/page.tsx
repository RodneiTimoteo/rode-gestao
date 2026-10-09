import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import { saveProposalAction } from "@/features/proposals/actions";
import { ProposalForm } from "@/features/proposals/components/proposal-form";
import { getProposalById, getProposalFormOptions } from "@/features/proposals/server/queries";

export const metadata: Metadata = { title: "Editar proposta" };
export default async function EditProposalPage({ params }: { params: Promise<{ proposalId: string }> }) { const { proposalId } = await params; if (!isUuid(proposalId)) notFound(); const context = await getCrmContext(); if (context.status !== "ready") return <NoOrganizationState />; const [proposal, options] = await Promise.all([getProposalById(context.supabase, context.organization.id, proposalId), getProposalFormOptions(context.supabase, context.organization.id)]); if (!proposal) notFound(); if (proposal.status !== "draft") return <div className="rounded-2xl border border-warning/20 bg-warning-soft p-6"><h1 className="font-semibold text-warning">Esta proposta não pode mais ser editada</h1><p className="mt-2 text-sm text-warning">Itens e dados comerciais só podem ser alterados em rascunhos. Para propostas encerradas, crie uma revisão.</p><Link className="mt-4 inline-block font-semibold text-brand" href={`/propostas/${proposal.id}`}>Voltar aos detalhes</Link></div>; return <><Link href={`/propostas/${proposal.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para a proposta</Link><header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{proposal.code}</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong">Editar proposta</h1></header><ProposalForm action={saveProposalAction.bind(null, proposal.id)} {...options} proposal={proposal} cancelHref={`/propostas/${proposal.id}`} /></>; }

