import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { updateClientAction } from "@/features/crm/actions";
import { ClientForm } from "@/features/crm/components/client-form";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { getClientById, getCrmMembers } from "@/features/crm/server/queries";
import { isUuid } from "@/features/crm/validation";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const [client, members] = await Promise.all([
    getClientById(context.supabase, context.organization.id, clientId),
    getCrmMembers(context.supabase, context.organization.id, context.user),
  ]);
  if (!client) notFound();
  const action = updateClientAction.bind(null, client.id);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/clientes/${client.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" /> Voltar para {client.name}</Link>
      <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Cadastro do cliente</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Editar {client.name}</h1><p className="mt-2 text-sm text-muted">Atualize somente os dados necessários. A organização e a autoria permanecem protegidas.</p></header>
      <ClientForm action={action} members={members} client={client} cancelHref={`/clientes/${client.id}`} />
    </div>
  );
}
