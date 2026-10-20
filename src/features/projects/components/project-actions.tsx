"use client";

import { useActionState, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { projectTransitionActionLabel } from "@/features/projects/presentation";
import type { ProjectActionState, ProjectStatus } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";
import { canTransitionProject } from "@/features/projects/validation";

type StateAction = (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;

function transitionButtonClass(status: ProjectStatus) {
  const base = "inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-60";
  if (status === "cancelled") return `${base} bg-danger-soft text-danger hover:brightness-95`;
  if (status === "completed") return `${base} bg-positive-soft text-positive hover:brightness-95`;
  if (status === "in_progress") return `${base} bg-brand text-on-brand hover:bg-brand-strong`;
  return `${base} border border-line bg-surface text-strong hover:border-brand hover:text-brand`;
}

function StatusForm({ currentStatus, status, action }: { currentStatus: ProjectStatus; status: ProjectStatus; action: StateAction }) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reasonId = useId();
  const critical = status === "completed" || status === "cancelled";
  const needsReason = status === "paused" || status === "awaiting_client";
  const actionLabel = projectTransitionActionLabel(currentStatus, status);

  if (needsReason && !expanded) {
    return (
      <button
        type="button"
        aria-controls={reasonId}
        aria-expanded="false"
        className={transitionButtonClass(status)}
        onClick={() => setExpanded(true)}
      >
        {actionLabel}
      </button>
    );
  }

  return (
    <>
      <form
        id={needsReason ? reasonId : undefined}
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        onSubmit={(event) => {
          if (critical && !confirmed.current) {
            event.preventDefault();
            setConfirming(true);
            return;
          }
          confirmed.current = false;
        }}
        className={needsReason ? "rounded-xl border border-line bg-soft/40 p-3 sm:col-span-2" : "h-full"}
      >
        {needsReason && (
          <Field
            label={status === "paused" ? "Justificativa para pausar" : "Justificativa para aguardar o cliente"}
            htmlFor={`${reasonId}-justification`}
            error={state.fieldErrors?.justification}
          >
            <textarea
              autoFocus
              id={`${reasonId}-justification`}
              name="justification"
              className={`${textareaClassName} min-h-20`}
              required
              maxLength={4000}
            />
          </Field>
        )}
        <div className={needsReason ? "mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" : "h-full"}>
          {needsReason && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-muted outline-none hover:text-strong focus-visible:ring-4 focus-visible:ring-brand-soft"
              onClick={() => setExpanded(false)}
            >
              Voltar
            </button>
          )}
          <button type="submit" disabled={pending} className={transitionButtonClass(status)}>
            {pending ? "Processando..." : needsReason ? "Confirmar alteração" : actionLabel}
          </button>
        </div>
        {state.message && <div className="mt-2"><FormMessage status={state.status} message={state.message} /></div>}
      </form>
      {critical && (
        <ConfirmDialog
          open={confirming}
          title={status === "completed" ? "Concluir projeto" : "Cancelar projeto"}
          description={status === "completed" ? "A conclusão encerra as alterações operacionais deste projeto. Deseja continuar?" : "O projeto continuará disponível para consulta, mas não poderá ser alterado. Deseja cancelar?"}
          confirmLabel={status === "completed" ? "Concluir projeto" : "Cancelar projeto"}
          danger={status === "cancelled"}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            confirmed.current = true;
            setConfirming(false);
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
        />
      )}
    </>
  );
}

function OwnerForm({ action, members, currentOwner }: { action: StateAction; members: CrmMember[]; currentOwner: string | null }) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  return (
    <form action={formAction} aria-busy={pending} className="space-y-3">
      <Field label="Responsável principal" htmlFor="owner_user_id" error={state.fieldErrors?.owner_user_id}>
        <select className={inputClassName} id="owner_user_id" name="owner_user_id" defaultValue={currentOwner ?? ""}>
          <option value="">Não atribuído</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
        </select>
      </Field>
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-strong outline-none hover:border-brand focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60">
        {pending ? "Salvando..." : "Alterar responsável"}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

function DeadlineForm({ action, currentDeadline }: { action: StateAction; currentDeadline: string | null }) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  return (
    <form action={formAction} aria-busy={pending} className="space-y-3">
      <Field label="Novo prazo" htmlFor="expected_end_date" error={state.fieldErrors?.expected_end_date}>
        <input className={inputClassName} id="expected_end_date" name="expected_end_date" type="date" required defaultValue={currentDeadline ?? ""} />
      </Field>
      <Field label="Justificativa obrigatória" htmlFor="deadline_justification" error={state.fieldErrors?.justification}>
        <textarea className={`${textareaClassName} min-h-20`} id="deadline_justification" name="justification" required maxLength={4000} />
      </Field>
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-strong outline-none hover:border-brand focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60">
        {pending ? "Alterando..." : "Alterar prazo"}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function ProjectActions({ status, members, ownerUserId, expectedEndDate, transition, assignOwner, changeDeadline }: {
  status: ProjectStatus;
  members: CrmMember[];
  ownerUserId: string | null;
  expectedEndDate: string | null;
  transition: (nextStatus: ProjectStatus, state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  assignOwner: StateAction;
  changeDeadline: StateAction;
}) {
  const terminal = status === "completed" || status === "cancelled";
  if (terminal) {
    return (
      <div className="rounded-xl border border-line bg-soft p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-strong">Situação atual</p>
          <ProjectStatusBadge status={status} />
        </div>
        <p className="mt-2 text-sm text-muted">Este projeto está encerrado e permanece disponível somente para consulta.</p>
      </div>
    );
  }

  const nextStatuses = (["in_progress", "paused", "awaiting_client", "completed", "cancelled"] as ProjectStatus[])
    .filter((next) => canTransitionProject(status, next));

  return (
    <div className="space-y-4">
      <section aria-labelledby="project-status-actions" className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="project-status-actions" className="text-sm font-semibold text-strong">Situação do projeto</h3>
          <ProjectStatusBadge status={status} />
        </div>
        <p className="mt-1 text-xs leading-5 text-subtle">Selecione uma das próximas situações permitidas.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {nextStatuses.map((next) => (
            <StatusForm
              key={next}
              currentStatus={status}
              status={next}
              action={transition.bind(null, next)}
            />
          ))}
        </div>
      </section>
      <details className="rounded-xl border border-line p-4 open:bg-soft/20">
        <summary className="cursor-pointer rounded-md text-sm font-semibold text-strong outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">Alterar responsável</summary>
        <div className="mt-4"><OwnerForm action={assignOwner} members={members} currentOwner={ownerUserId} /></div>
      </details>
      <details className="rounded-xl border border-line p-4 open:bg-soft/20">
        <summary className="cursor-pointer rounded-md text-sm font-semibold text-strong outline-none focus-visible:ring-4 focus-visible:ring-brand-soft">Alterar prazo com justificativa</summary>
        <div className="mt-4"><DeadlineForm action={changeDeadline} currentDeadline={expectedEndDate} /></div>
      </details>
    </div>
  );
}
