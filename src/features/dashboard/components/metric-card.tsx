import { Icon } from "@/components/ui/icon";
import type { Metric } from "@/features/dashboard/types";

export function MetricCard({ metric }: { metric: Metric }) {
  return <article className="rounded-2xl border border-line bg-surface p-5"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={metric.icon} className="size-[19px]" /></div>{metric.trend && <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2 py-1 text-[11px] font-semibold text-positive"><Icon name="arrowUp" className="size-3" />{metric.trend}</span>}</div><p className="mt-5 text-[13px] font-medium text-muted">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-strong">{metric.value}</p><p className="mt-2 text-[11px] leading-4 text-subtle">{metric.detail}</p></article>;
}
