import { proposalEventLabels } from "@/features/proposals/constants";
import { formatProposalDate } from "@/features/proposals/format";
import type { ProposalEvent } from "@/features/proposals/types";

export function ProposalHistory({ events, actorNames }: { events: ProposalEvent[]; actorNames: Record<string, string> }) {
  if (!events.length) return <p className="text-sm text-muted">Nenhum evento registrado.</p>;
  return <ol className="space-y-4">{events.map((event) => <li key={event.id} className="relative border-l border-line pl-5 before:absolute before:-left-1.5 before:top-1 before:size-3 before:rounded-full before:bg-brand"><p className="text-sm font-semibold text-strong">{proposalEventLabels[event.event_type] ?? event.description ?? "Evento"}</p><p className="mt-1 text-xs text-muted">{formatProposalDate(event.occurred_at, true)} · {actorNames[event.actor_user_id] ?? "Membro da organização"}</p>{event.description && <p className="mt-1 text-sm text-muted">{event.description}</p>}</li>)}</ol>;
}
