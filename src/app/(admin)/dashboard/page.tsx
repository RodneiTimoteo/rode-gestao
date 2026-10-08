import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { AppointmentsList } from "@/features/dashboard/components/appointments-list";
import { MetricCard } from "@/features/dashboard/components/metric-card";
import { ProjectsChart } from "@/features/dashboard/components/projects-chart";
import { RevenueChart } from "@/features/dashboard/components/revenue-chart";
import { TasksList } from "@/features/dashboard/components/tasks-list";
import { metrics } from "@/features/dashboard/data/mock-data";

export const metadata: Metadata = { title: "Dashboard" };
export default function DashboardPage() {
  return <><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageHeader eyebrow="Visão geral" title="Dashboard" description="Acompanhe os principais indicadores e atividades da RODE." /><div className="mb-6 w-fit rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-muted sm:mb-8"><span className="mr-2 inline-block size-1.5 rounded-full bg-warning" />Dados fictícios para demonstração</div></div><section aria-label="Indicadores principais" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section><section aria-label="Gráficos do negócio" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]"><RevenueChart /><ProjectsChart /></section><section aria-label="Atividades próximas" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]"><TasksList /><AppointmentsList /></section></>;
}
