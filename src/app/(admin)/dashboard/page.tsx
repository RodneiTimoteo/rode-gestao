import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/ui/icon";
import { AppointmentsList } from "@/features/dashboard/components/appointments-list";
import { MetricCard } from "@/features/dashboard/components/metric-card";
import { ProjectsChart } from "@/features/dashboard/components/projects-chart";
import { RevenueChart } from "@/features/dashboard/components/revenue-chart";
import { TasksList } from "@/features/dashboard/components/tasks-list";
import { metrics } from "@/features/dashboard/data/mock-data";

export const metadata: Metadata = { title: "Dashboard" };
export default function DashboardPage() {
  return <><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><PageHeader eyebrow="Visão geral" title="Dashboard" description="Acompanhe os principais indicadores e atividades da RODE." /><div className="mb-6 flex flex-wrap items-center gap-2 sm:mb-8"><span className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] font-medium text-warning"><span className="mr-2 inline-block size-1.5 rounded-full bg-warning" />Dados fictícios para demonstração</span><Link href="/clientes/novo" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-muted shadow-[var(--shadow-sm)] hover:text-brand"><Icon name="plus" className="size-3.5" />Novo cliente</Link><Link href="/propostas/nova" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-on-brand shadow-[var(--shadow-sm)] hover:bg-brand-strong"><Icon name="file" className="size-3.5" />Nova proposta</Link></div></div><section aria-label="Indicadores principais" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section><section aria-label="Gráficos do negócio" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]"><RevenueChart /><ProjectsChart /></section><section aria-label="Atividades próximas" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]"><TasksList /><AppointmentsList /></section></>;
}
