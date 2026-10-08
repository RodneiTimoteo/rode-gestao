import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ClientStatusBadge } from "@/features/crm/components/status-badges";
import { clientKindLabels } from "@/features/crm/constants";
import { formatDate } from "@/features/crm/format";
import type { ClientFilters, ClientListResult, CrmMember } from "@/features/crm/types";

function pageHref(filters: ClientFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.sort !== "recent") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/clientes${query ? `?${query}` : ""}`;
}

export function ClientList({ result, filters, members }: { result: ClientListResult; filters: ClientFilters; members: CrmMember[] }) {
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  const pageCount = Math.max(1, Math.ceil(result.count / result.pageSize));

  if (!result.clients.length) {
    return (
      <section className="grid min-h-[330px] place-items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center">
        <div className="max-w-md">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon name="users" className="size-6" /></div>
          <h2 className="mt-4 text-lg font-semibold text-strong">{result.count === 0 && !filters.query && filters.status === "all" && filters.kind === "all" ? "Comece sua carteira de clientes" : "Nenhum cliente encontrado"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{filters.query || filters.status !== "all" || filters.kind !== "all" ? "Ajuste a busca ou os filtros para encontrar outros resultados." : "Cadastre o primeiro cliente ou lead da organização."}</p>
          <Link href="/clientes/novo" className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Icon name="plus" className="size-4" /> Novo cliente</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-soft/70 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            <tr><th className="px-5 py-3.5">Cliente</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Contato</th><th className="px-5 py-3.5">Responsável</th><th className="px-5 py-3.5">Atualizado</th><th className="w-10 px-4"><span className="sr-only">Abrir</span></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.clients.map((client) => (
              <tr key={client.id} className="group hover:bg-soft/60">
                <td className="px-5 py-4"><Link href={`/clientes/${client.id}`} className="font-semibold text-strong group-hover:text-brand">{client.name}</Link><p className="mt-1 text-xs text-subtle">{clientKindLabels[client.kind]}{client.segment ? ` · ${client.segment}` : ""}</p></td>
                <td className="px-5 py-4"><ClientStatusBadge status={client.status} /></td>
                <td className="px-5 py-4 text-muted"><p>{client.contact_name ?? client.responsible_name ?? "—"}</p><p className="mt-1 text-xs text-subtle">{client.email ?? client.phone ?? "Sem contato informado"}</p></td>
                <td className="px-5 py-4 text-muted">{client.assigned_to ? memberNames.get(client.assigned_to) ?? "Membro" : "Não atribuído"}</td>
                <td className="px-5 py-4 text-muted">{formatDate(client.updated_at)}</td>
                <td className="px-4"><Link href={`/clientes/${client.id}`} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-brand-soft hover:text-brand" aria-label={`Abrir ${client.name}`}><Icon name="chevronRight" className="size-4" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {result.clients.map((client) => (
          <Link key={client.id} href={`/clientes/${client.id}`} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/30">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-strong">{client.name}</h2><p className="mt-1 text-xs text-subtle">{clientKindLabels[client.kind]}{client.segment ? ` · ${client.segment}` : ""}</p></div><ClientStatusBadge status={client.status} /></div>
            <div className="mt-4 grid gap-2 text-sm text-muted"><p>{client.contact_name ?? client.responsible_name ?? "Contato não informado"}</p><p className="text-xs text-subtle">{client.email ?? client.phone ?? "Sem canal de contato"}</p></div>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted">{result.count} {result.count === 1 ? "registro" : "registros"} · Página {result.page} de {pageCount}</p>
        <div className="flex gap-2">
          {result.page > 1 ? <Link href={pageHref(filters, result.page - 1)} className="rounded-lg border border-line px-3 py-2 font-medium text-muted hover:bg-soft">Anterior</Link> : <span className="rounded-lg border border-line px-3 py-2 text-subtle opacity-50">Anterior</span>}
          {result.page < pageCount ? <Link href={pageHref(filters, result.page + 1)} className="rounded-lg border border-line px-3 py-2 font-medium text-muted hover:bg-soft">Próxima</Link> : <span className="rounded-lg border border-line px-3 py-2 text-subtle opacity-50">Próxima</span>}
        </div>
      </div>
    </>
  );
}
