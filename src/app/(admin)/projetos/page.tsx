import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { NoOrganizationState } from "@/features/crm/components/no-organization-state";
import { getCrmContext } from "@/features/crm/server/context";
import { projectStatuses } from "@/features/projects/constants";
import { ProjectList } from "@/features/projects/components/project-list";
import { getProjectIndicators, getProjects } from "@/features/projects/server/queries";
import type { ProjectFilters, ProjectStatus } from "@/features/projects/types";

export const metadata: Metadata = { title: "Projetos" };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getCrmContext();
  if (context.status !== "ready") return <NoOrganizationState />;
  const params = await searchParams;
  const rawStatus = first(params.status);
  const rawPage = Number(first(params.page) ?? "1");
  const filters: ProjectFilters = {
    query: (first(params.q) ?? "").trim().slice(0, 80),
    status: rawStatus && projectStatuses.includes(rawStatus as ProjectStatus) ? rawStatus as ProjectStatus : "all",
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
  const [result, indicators] = await Promise.all([
    getProjects(context.supabase, context.organization.id, filters, context.user),
    getProjectIndicators(context.supabase, context.organization.id),
  ]);
  const cards = [
    ["Total", indicators.total, "Portfólio cadastrado"],
    ["Em andamento", indicators.active, "Execução ativa"],
    ["Atenção", indicators.attention, "Pausados ou com cliente"],
    ["Em atraso", indicators.overdue, "Prazo atual vencido"],
  ];
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><PageHeader eyebrow="Gestão de projetos" title="Projetos" description="Acompanhe responsáveis, situações e prazos com histórico auditável." /><Link href="/projetos/novo" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-strong"><Icon name="plus" className="size-4" /> Novo projeto</Link></div>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, hint]) => <div key={String(label)} className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-medium text-subtle">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-strong">{value}</p><p className="mt-1 text-xs text-muted">{hint}</p></div>)}</section>
    <ProjectList result={result} filters={filters} />
  </>;
}
