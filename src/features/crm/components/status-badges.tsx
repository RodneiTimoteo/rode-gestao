import { clientStatusLabels, opportunityOutcomeLabels } from "@/features/crm/constants";
import type { ClientStatus, OpportunityOutcome } from "@/features/crm/types";

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const tone = status === "active"
    ? "bg-positive-soft text-positive"
    : status === "lead"
      ? "bg-warning-soft text-warning"
      : "bg-soft text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{clientStatusLabels[status]}</span>;
}

export function OpportunityOutcomeBadge({ outcome }: { outcome: OpportunityOutcome }) {
  const tone = outcome === "won"
    ? "bg-positive-soft text-positive"
    : outcome === "lost"
      ? "bg-danger-soft text-danger"
      : "bg-brand-soft text-brand";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{opportunityOutcomeLabels[outcome]}</span>;
}
