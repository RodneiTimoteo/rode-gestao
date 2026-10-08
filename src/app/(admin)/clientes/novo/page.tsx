import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { createClientAction } from "@/features/crm/actions";
import { ClientForm } from "@/features/crm/components/client-form";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { getCrmMembers } from "@/features/crm/server/queries";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const members = await getCrmMembers(context.supabase, context.organization.id, context.user);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/clientes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para clientes</Link>
      <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Cadastro rápido</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Novo cliente</h1><p className="mt-2 text-sm leading-6 text-muted">Somente nome, tipo e status são obrigatórios. Complete os demais dados quando fizer sentido.</p></header>
      <ClientForm action={createClientAction} members={members} cancelHref="/clientes" />
    </div>
  );
}
