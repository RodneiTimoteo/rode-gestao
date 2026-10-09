import { proposalStatusLabels } from "@/features/proposals/constants";
import type { ProposalStatus } from "@/features/proposals/types";

const classes: Record<ProposalStatus, string> = {
  draft: "bg-soft text-muted", sent: "bg-brand-soft text-brand", negotiating: "bg-warning-soft text-warning",
  approved: "bg-positive-soft text-positive", rejected: "bg-danger-soft text-danger", expired: "bg-soft text-subtle", cancelled: "bg-danger-soft text-danger",
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{proposalStatusLabels[status]}</span>;
}

