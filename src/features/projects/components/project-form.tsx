"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import type { ApprovedProposalChoice, ProjectActionState } from "@/features/projects/types";
import { initialProjectActionState } from "@/features/projects/types";
import { formatProjectCurrency } from "@/features/projects/format";

type ProjectFormProps = {
  action: (state: ProjectActionState, formData: FormData) => Promise<ProjectActionState>;
  members: CrmMember[];
  clients?: Array<{ id: string; name: string }>;
  proposal?: ApprovedProposalChoice;
};

export function ProjectForm({ action, members, clients = [], proposal }: ProjectFormProps) {
  const [state, formAction, pending] = useActionState(action, initialProjectActionState);
  return <form action={formAction} className="space-y-5">
    <FormMessage status={state.status} message={state.message} />
    {proposal && <section className="rounded-2xl border border-brand/20 bg-brand-soft p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Origem comercial confirmada</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-subtle">Proposta</p><p className="mt-1 text-sm font-semibold text-strong">{proposal.code} · Revisão {proposal.revision_number}</p></div>
        <div><p className="text-xs text-subtle">Cliente</p><p className="mt-1 text-sm font-semibold text-strong">{proposal.clientName}</p></div>
        <div><p className="text-xs text-subtle">Formato contratado</p><p className="mt-1 text-sm font-semibold text-strong">{proposal.selectedOptionName ?? "Proposta simples"}</p></div>
        <div><p className="text-xs text-subtle">Valor aprovado</p><p className="mt-1 text-sm font-semibold text-brand">{formatProjectCurrency(proposal.total_amount)}</p></div>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">A revisão, a opção selecionada, os itens e o valor serão preservados em um snapshot imutável.</p>
    </section>}

    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-base font-semibold text-strong">Informações gerais</h2>
      <p className="mt-1 text-sm text-muted">Todo projeto inicia em Planejamento.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Nome do projeto *" htmlFor="name" error={state.fieldErrors?.name}>
          <input className={inputClassName} id="name" name="name" defaultValue={proposal?.title ?? ""} required maxLength={200} autoFocus />
        </Field>
        {!proposal && <Field label="Cliente *" htmlFor="client_id" error={state.fieldErrors?.client_id}>
          <select className={inputClassName} id="client_id" name="client_id" required defaultValue="">
            <option value="" disabled>Selecione um cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </Field>}
        <div className="md:col-span-2">
          <Field label="Descrição ou escopo" htmlFor="description" error={state.fieldErrors?.description}>
            <textarea className={textareaClassName} id="description" name="description" maxLength={8000} defaultValue={proposal?.notes ?? ""} placeholder="Descreva o objetivo, as entregas e os limites do projeto." />
          </Field>
        </div>
        <Field label="Responsável principal" htmlFor="owner_user_id" error={state.fieldErrors?.owner_user_id}>
          <select className={inputClassName} id="owner_user_id" name="owner_user_id" defaultValue="">
            <option value="">Não atribuído</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
          </select>
        </Field>
        {!proposal && <Field label="Valor contratado" htmlFor="contracted_amount" error={state.fieldErrors?.contracted_amount} hint="Opcional. Use vírgula para centavos.">
          <input className={inputClassName} id="contracted_amount" name="contracted_amount" inputMode="decimal" placeholder="0,00" />
        </Field>}
        <Field label="Data de início" htmlFor="start_date" error={state.fieldErrors?.start_date}>
          <input className={inputClassName} id="start_date" name="start_date" type="date" />
        </Field>
        <Field label="Prazo de entrega" htmlFor="expected_end_date" error={state.fieldErrors?.expected_end_date} hint="Após a criação, alterações exigirão justificativa.">
          <input className={inputClassName} id="expected_end_date" name="expected_end_date" type="date" />
        </Field>
      </div>
    </section>

    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Link href="/projetos" className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-muted hover:bg-soft">Cancelar</Link>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60">
        {pending ? "Criando projeto..." : proposal ? "Confirmar e criar projeto" : "Cadastrar projeto"}
      </button>
    </div>
  </form>;
}
