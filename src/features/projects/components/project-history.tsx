import { projectEventLabels } from "@/features/projects/constants";
import { formatProjectDate } from "@/features/projects/format";
import {
  getProjectDeadlineEventDetails,
  getProjectStageStatusEventDetails,
  getProjectTaskStatusEventDetails,
  getProjectStatusEventDetails,
  translateProjectStatusDescription,
} from "@/features/projects/presentation";
import type { ProjectEvent } from "@/features/projects/types";

function ChangeDetails({ from, to }: { from: string; to: string }) {
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">De</dt>
        <dd className="mt-0.5 text-sm font-medium text-strong">{from}</dd>
      </div>
      <div className="rounded-lg border border-line bg-surface px-3 py-2">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Para</dt>
        <dd className="mt-0.5 text-sm font-medium text-strong">{to}</dd>
      </div>
    </dl>
  );
}

function EventContent({ event }: { event: ProjectEvent }) {
  if (["task_status_changed", "task_completed", "task_reopened"].includes(event.event_type)) {
    const status = getProjectTaskStatusEventDetails(event.event_data);
    if (status.from || status.to) {
      return <ChangeDetails from={status.from ?? "Não informado"} to={status.to ?? "Não informado"} />;
    }
  }

  if (event.event_type === "stage_updated") {
    const status = getProjectStageStatusEventDetails(event.event_data);
    if (status.from && status.to && status.from !== status.to) {
      return <ChangeDetails from={status.from} to={status.to} />;
    }
  }

  if (event.event_type === "deadline_changed" || event.event_type === "task_deadline_changed") {
    const deadline = getProjectDeadlineEventDetails(event.event_data);
    return (
      <>
        <ChangeDetails
          from={deadline.from ? formatProjectDate(deadline.from) : "Não informado"}
          to={deadline.to ? formatProjectDate(deadline.to) : "Não informado"}
        />
        {event.event_type === "deadline_changed" && (
          <p className="mt-2 rounded-lg bg-soft px-3 py-2 text-sm leading-5 text-muted">
            <strong className="text-strong">Justificativa:</strong>{" "}
            {event.justification?.trim() || "Não informada no histórico."}
          </p>
        )}
      </>
    );
  }

  if (["status_changed", "completed", "cancelled"].includes(event.event_type)) {
    const status = getProjectStatusEventDetails(event.event_data);
    if (status.from || status.to) {
      return (
        <>
          <ChangeDetails from={status.from ?? "Não informado"} to={status.to ?? "Não informado"} />
          {event.justification?.trim() && (
            <p className="mt-2 rounded-lg bg-soft px-3 py-2 text-sm leading-5 text-muted">
              <strong className="text-strong">Justificativa:</strong> {event.justification}
            </p>
          )}
        </>
      );
    }
  }

  return (
    <>
      <p className="mt-1 text-sm text-muted">{translateProjectStatusDescription(event.description)}</p>
      {event.justification?.trim() && (
        <p className="mt-2 rounded-lg bg-soft px-3 py-2 text-sm leading-5 text-muted">
          <strong className="text-strong">Justificativa:</strong> {event.justification}
        </p>
      )}
    </>
  );
}

export function ProjectHistory({ events }: { events: ProjectEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted">Nenhum evento registrado.</p>;

  return (
    <ol className="space-y-4">
      {events.map((event) => (
        <li key={event.id} className="relative border-l border-line pb-1 pl-4 before:absolute before:-left-1 before:top-1.5 before:size-2 before:rounded-full before:bg-brand">
          <p className="text-sm font-semibold text-strong">{projectEventLabels[event.event_type]}</p>
          <EventContent event={event} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            <p>
              <span className="font-medium text-muted">Data e horário:</span>{" "}
              <time dateTime={event.occurred_at}>{formatProjectDate(event.occurred_at, true)}</time>
            </p>
            <p><span className="font-medium text-muted">Usuário:</span> {event.actorName || "Não identificado"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
