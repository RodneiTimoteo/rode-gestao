import { Icon } from "@/components/ui/icon";
import type { Metric } from "@/features/dashboard/types";

export function MetricCard({ metric }: { metric: Metric }) {
  return <article className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-sm)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/30"><span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand via-brand/55 to-transparent" /><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl border border-brand/15 bg-brand-soft text-brand"><Icon name={metric.icon} className="size-[19px]" /></div>{metric.trend && <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2 py-1 text-[11px] font-semibold text-positive"><Icon name="arrowUp" className="size-3" />{metric.trend}</span>}</div><p className="mt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-muted">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-strong">{metric.value}</p><p className="mt-2 text-[11px] leading-4 text-subtle">{metric.detail}</p></article>;
}
