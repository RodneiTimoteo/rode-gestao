import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { projectStatusLabels, projectStatuses } from "@/features/projects/constants";
import { formatProjectDate, projectDeadlineState } from "@/features/projects/format";
import type { ProjectFilters, ProjectListResult } from "@/features/projects/types";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";

function pageHref(filters: ProjectFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "all") params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/projetos${query ? `?${query}` : ""}`;
}

export function ProjectList({ result, filters }: { result: ProjectListResult; filters: ProjectFilters }) {
  const pageCount = Math.max(1, Math.ceil(result.count / result.pageSize));
  return <>
    <form className="mb-5 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]" action="/projetos">
      <label className="relative"><span className="sr-only">Pesquisar projetos</span><Icon name="search" className="pointer-events-none absolute left-3 top-3.5 size-4 text-subtle" /><input name="q" defaultValue={filters.query} className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-strong outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="Projeto ou cliente" /></label>
      <select name="status" defaultValue={filters.status} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm text-strong outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"><option value="all">Todas as situações</option>{projectStatuses.map((status) => <option key={status} value={status}>{projectStatusLabels[status]}</option>)}</select>
      <button className="h-11 rounded-xl border border-line bg-soft px-5 text-sm font-semibold text-strong hover:border-brand">Filtrar</button>
    </form>
    {!result.projects.length ? <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center"><Icon name="projects" className="mx-auto size-8 text-brand" /><h2 className="mt-4 font-semibold text-strong">Nenhum projeto encontrado</h2><p className="mt-2 text-sm text-muted">Ajuste os filtros ou cadastre o primeiro projeto.</p></div> : <div className="grid gap-3">
      {result.projects.map((project) => { const deadline = projectDeadlineState(project.expected_end_date, project.status); return <Link key={project.id} href={`/projetos/${project.id}`} className="group grid gap-4 rounded-2xl border border-line bg-surface p-5 transition hover:border-brand/50 md:grid-cols-[minmax(0,1.5fr)_minmax(160px,.8fr)_minmax(140px,.7fr)_120px] md:items-center">
        <div className="min-w-0"><h2 className="truncate font-semibold text-strong group-hover:text-brand">{project.name}</h2><p className="mt-1 truncate text-sm text-muted">{project.clientName}</p></div>
        <div><p className="mb-1 text-xs text-subtle">Situação</p><ProjectStatusBadge status={project.status} /></div>
        <div><p className="text-xs text-subtle">Responsável</p><p className="mt-1 truncate text-sm font-medium text-strong">{project.ownerName ?? "Não atribuído"}</p></div>
        <div><p className="text-xs text-subtle">Prazo atual</p><p className={`mt-1 text-sm font-semibold ${deadline === "overdue" ? "text-danger" : deadline === "near" ? "text-warning" : "text-strong"}`}>{formatProjectDate(project.expected_end_date)}</p>{deadline === "overdue" && <p className="mt-0.5 text-[11px] text-danger">Em atraso</p>}</div>
      </Link>; })}
    </div>}
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-muted">{result.count} {result.count === 1 ? "projeto" : "projetos"} · Página {result.page} de {pageCount}</p><div className="flex gap-2">{result.page > 1 ? <Link href={pageHref(filters, result.page - 1)} className="rounded-lg border border-line px-3 py-2 font-medium text-muted hover:bg-soft">Anterior</Link> : <span className="rounded-lg border border-line px-3 py-2 text-subtle opacity-50">Anterior</span>}{result.page < pageCount ? <Link href={pageHref(filters, result.page + 1)} className="rounded-lg border border-line px-3 py-2 font-medium text-muted hover:bg-soft">Próxima</Link> : <span className="rounded-lg border border-line px-3 py-2 text-subtle opacity-50">Próxima</span>}</div></div>
  </>;
}
