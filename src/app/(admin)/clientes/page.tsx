import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ClientList } from "@/features/crm/components/client-list";
import { CrmNavigation } from "@/features/crm/components/crm-navigation";
import { inputClassName } from "@/features/crm/components/form-controls";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { clientKindLabels, clientStatusLabels } from "@/features/crm/constants";
import { getCrmContext } from "@/features/crm/server/context";
import { getClients, getCrmMembers } from "@/features/crm/server/queries";
import type { ClientFilters, ClientKind, ClientStatus } from "@/features/crm/types";

export const metadata: Metadata = { title: "Clientes" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const params = await searchParams;
  const statusValue = first(params.status);
  const kindValue = first(params.kind);
  const sortValue = first(params.sort);
  const parsedPage = Number(first(params.page) ?? "1");
  const filters: ClientFilters = {
    query: (first(params.q) ?? "").trim().slice(0, 80),
    status: statusValue && ["lead", "active", "inactive"].includes(statusValue) ? statusValue as ClientStatus : "all",
    kind: kindValue && ["company", "person"].includes(kindValue) ? kindValue as ClientKind : "all",
    sort: sortValue && ["name", "oldest"].includes(sortValue) ? sortValue as "name" | "oldest" : "recent",
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1,
  };
  const [result, members] = await Promise.all([
    getClients(context.supabase, context.organization.id, filters),
    getCrmMembers(context.supabase, context.organization.id, context.user),
  ]);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">CRM · {context.organization.name}</p><h1 className="mt-2 text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">Clientes</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Gerencie leads, clientes ativos e relacionamentos comerciais em um só lugar.</p></div>
        <Link href="/clientes/novo" className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Icon name="plus" className="size-4" /> Novo cliente</Link>
      </div>
      <div className="mt-6"><CrmNavigation active="clients" /></div>

      <form className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 md:grid-cols-[minmax(220px,1fr)_160px_150px_160px_auto]" role="search">
        <label className="relative"><span className="sr-only">Buscar clientes</span><Icon name="search" className="pointer-events-none absolute left-3 top-3.5 size-4 text-subtle" /><input className={`${inputClassName} pl-9`} type="search" name="q" defaultValue={filters.query} placeholder="Nome, contato ou e-mail" /></label>
        <label><span className="sr-only">Status</span><select className={inputClassName} name="status" defaultValue={filters.status}><option value="all">Todos os status</option>{Object.entries(clientStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Tipo</span><select className={inputClassName} name="kind" defaultValue={filters.kind}><option value="all">Todos os tipos</option>{Object.entries(clientKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Ordenação</span><select className={inputClassName} name="sort" defaultValue={filters.sort}><option value="recent">Mais recentes</option><option value="name">Nome A–Z</option><option value="oldest">Mais antigos</option></select></label>
        <button className="h-11 rounded-xl border border-line bg-soft px-4 text-sm font-semibold text-strong hover:bg-brand-soft hover:text-brand" type="submit">Aplicar</button>
      </form>

      <ClientList result={result} filters={filters} members={members} />
    </>
  );
}
