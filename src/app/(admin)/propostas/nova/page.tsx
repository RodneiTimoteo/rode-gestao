import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { saveProposalAction } from "@/features/proposals/actions";
import { ProposalForm } from "@/features/proposals/components/proposal-form";
import { getProposalFormOptions } from "@/features/proposals/server/queries";

export const metadata: Metadata = { title: "Nova proposta" };
export default async function NewProposalPage({ searchParams }: { searchParams: Promise<{ clientId?: string | string[] }> }) {
  const context = await getCrmContext(); if (context.status !== "ready") return <NoOrganizationState />;
  const options = await getProposalFormOptions(context.supabase, context.organization.id); const query = await searchParams; const clientId = Array.isArray(query.clientId) ? query.clientId[0] : query.clientId;
  return <><Link href="/propostas" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para propostas</Link><header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Comercial</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong">Nova proposta</h1><p className="mt-2 text-sm text-muted">Crie um rascunho com itens e condições comerciais.</p></header><ProposalForm action={saveProposalAction.bind(null, null)} {...options} initialClientId={options.clients.some((client) => client.id === clientId) ? clientId : undefined} cancelHref="/propostas" /></>;
}

