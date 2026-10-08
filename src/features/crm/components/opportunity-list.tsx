import Link from "next/link";
import { OpportunityOutcomeBadge } from "@/features/crm/components/status-badges";
import { formatCurrency, formatDate } from "@/features/crm/format";
import type { CrmMember, OpportunityRecord, PipelineStage } from "@/features/crm/types";

export function OpportunityList({ clientId, opportunities, stages, members }: { clientId: string; opportunities: OpportunityRecord[]; stages: PipelineStage[]; members: CrmMember[] }) {
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  if (!opportunities.length) return <p className="rounded-xl bg-soft px-4 py-6 text-center text-sm text-muted">Nenhuma oportunidade cadastrada para este cliente.</p>;
  return (
    <div className="grid gap-3">
      {opportunities.map((opportunity) => (
        <article key={opportunity.id} className="rounded-xl border border-line p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-strong">{opportunity.title}</h3><OpportunityOutcomeBadge outcome={opportunity.outcome} /></div><p className="mt-1 text-sm text-muted">{opportunity.service_interest ?? "Serviço não informado"}</p></div>
            <Link href={`/clientes/${clientId}/oportunidades/${opportunity.id}/editar`} className="text-sm font-semibold text-brand hover:text-brand-strong">Editar</Link>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-subtle">Etapa</dt><dd className="mt-1 text-muted">{stageNames.get(opportunity.pipeline_stage_id) ?? "Etapa indisponível"}</dd></div><div><dt className="text-xs text-subtle">Valor</dt><dd className="mt-1 text-muted">{formatCurrency(opportunity.estimated_value)}</dd></div><div><dt className="text-xs text-subtle">Previsão</dt><dd className="mt-1 text-muted">{formatDate(opportunity.expected_close_date)}</dd></div></dl>
          {opportunity.owner_user_id && <p className="mt-3 text-xs text-subtle">Responsável: {memberNames.get(opportunity.owner_user_id) ?? "Membro"}</p>}
          {opportunity.outcome === "lost" && opportunity.lost_reason && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger"><strong>Motivo da perda:</strong> {opportunity.lost_reason}</p>}
        </article>
      ))}
    </div>
  );
}
