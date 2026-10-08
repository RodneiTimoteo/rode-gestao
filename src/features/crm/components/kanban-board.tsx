import Link from "next/link";
import { OpportunityStageForm } from "@/features/crm/components/opportunity-stage-form";
import { OpportunityOutcomeBadge } from "@/features/crm/components/status-badges";
import { formatCurrency, formatDate } from "@/features/crm/format";
import type { ActionState, KanbanOpportunity, PipelineStage } from "@/features/crm/types";

type MoveAction = (opportunityId: string, state: ActionState, payload: FormData) => Promise<ActionState>;

function OpportunityCard({ opportunity, stages, moveAction }: { opportunity: KanbanOpportunity; stages: PipelineStage[]; moveAction: MoveAction }) {
  const action = moveAction.bind(null, opportunity.id);
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2"><Link href={`/clientes/${opportunity.client_id}`} className="font-semibold leading-5 text-strong hover:text-brand">{opportunity.title}</Link><OpportunityOutcomeBadge outcome={opportunity.outcome} /></div>
      <p className="mt-1 text-xs font-medium text-brand">{opportunity.clientName}</p>
      <p className="mt-3 text-sm text-muted">{formatCurrency(opportunity.estimated_value)}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-subtle"><span>{opportunity.ownerName ?? "Sem responsável"}</span><span>{formatDate(opportunity.expected_close_date)}</span></div>
      {opportunity.outcome === "lost" && opportunity.lost_reason && <p className="mt-3 line-clamp-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-danger">{opportunity.lost_reason}</p>}
      <OpportunityStageForm action={action} stages={stages} currentStageId={opportunity.pipeline_stage_id} />
    </article>
  );
}

export function KanbanBoard({ opportunities, stages, moveAction, view }: { opportunities: KanbanOpportunity[]; stages: PipelineStage[]; moveAction: MoveAction; view: "board" | "list" }) {
  if (!stages.length) return <div className="rounded-2xl border border-warning/20 bg-warning-soft p-6 text-sm text-warning">Nenhuma etapa ativa foi configurada para esta organização.</div>;

  if (view === "list") {
    const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="divide-y divide-line">
          {opportunities.length ? opportunities.map((opportunity) => (
            <div key={opportunity.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_160px_140px] sm:items-center">
              <div><Link href={`/clientes/${opportunity.client_id}`} className="font-semibold text-strong hover:text-brand">{opportunity.title}</Link><p className="mt-1 text-xs text-subtle">{opportunity.clientName} · {opportunity.ownerName ?? "Sem responsável"}</p></div>
              <div><p className="text-xs text-subtle">{stageNames.get(opportunity.pipeline_stage_id)}</p><p className="mt-1 text-sm text-muted">{formatCurrency(opportunity.estimated_value)}</p></div>
              <OpportunityOutcomeBadge outcome={opportunity.outcome} />
            </div>
          )) : <p className="p-10 text-center text-sm text-muted">Nenhuma oportunidade no funil.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid min-w-max auto-cols-[minmax(280px,320px)] grid-flow-col gap-4">
        {stages.map((stage) => {
          const items = opportunities.filter((opportunity) => opportunity.pipeline_stage_id === stage.id);
          const total = items.reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
          return (
            <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="rounded-2xl bg-soft/70 p-3">
              <header className="mb-3 flex items-start justify-between gap-3 px-1"><div><h2 id={`stage-${stage.id}`} className="text-sm font-semibold text-strong">{stage.name}</h2><p className="mt-1 text-xs text-subtle">{formatCurrency(total)}</p></div><span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold text-muted">{items.length}</span></header>
              <div className="space-y-3">{items.length ? items.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} stages={stages} moveAction={moveAction} />) : <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-subtle">Nenhuma oportunidade</p>}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
