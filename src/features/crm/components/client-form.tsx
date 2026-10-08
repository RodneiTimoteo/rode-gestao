"use client";

import Link from "next/link";
import { useActionState } from "react";
import { clientKindLabels, clientKinds, clientStatusLabels, clientStatuses } from "@/features/crm/constants";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { ActionState, ClientRecord, CrmMember } from "@/features/crm/types";
import { initialActionState } from "@/features/crm/types";

type ClientFormProps = {
  action: (state: ActionState, payload: FormData) => Promise<ActionState>;
  members: CrmMember[];
  client?: ClientRecord;
  cancelHref: string;
};

export function ClientForm({ action, members, client, cancelHref }: ClientFormProps) {
  const [state, formAction, pending] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold text-strong">Identificação</h2>
        <p className="mt-1 text-sm text-muted">Nome e classificação essenciais para localizar o cadastro.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Nome *" htmlFor="name" error={state.fieldErrors?.name}>
            <input className={inputClassName} id="name" name="name" defaultValue={client?.name} required maxLength={160} autoFocus />
          </Field>
          <Field label="Tipo *" htmlFor="kind" error={state.fieldErrors?.kind}>
            <select className={inputClassName} id="kind" name="kind" defaultValue={client?.kind ?? "company"} required>
              {clientKinds.map((kind) => <option key={kind} value={kind}>{clientKindLabels[kind]}</option>)}
            </select>
          </Field>
          <Field label="Razão social / nome empresarial" htmlFor="legal_name">
            <input className={inputClassName} id="legal_name" name="legal_name" defaultValue={client?.legal_name ?? ""} maxLength={200} />
          </Field>
          <Field label="CPF / CNPJ" htmlFor="tax_id" error={state.fieldErrors?.tax_id} hint="Somente os dígitos serão armazenados para evitar duplicidade.">
            <input className={inputClassName} id="tax_id" name="tax_id" defaultValue={client?.tax_id ?? ""} inputMode="numeric" maxLength={30} />
          </Field>
          <Field label="Status *" htmlFor="status" error={state.fieldErrors?.status}>
            <select className={inputClassName} id="status" name="status" defaultValue={client?.status ?? "lead"} required>
              {clientStatuses.map((status) => <option key={status} value={status}>{clientStatusLabels[status]}</option>)}
            </select>
          </Field>
          <Field label="Responsável interno" htmlFor="assigned_to" error={state.fieldErrors?.assigned_to}>
            <select className={inputClassName} id="assigned_to" name="assigned_to" defaultValue={client?.assigned_to ?? ""}>
              <option value="">Não atribuído</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold text-strong">Contato</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Nome do responsável" htmlFor="responsible_name"><input className={inputClassName} id="responsible_name" name="responsible_name" defaultValue={client?.responsible_name ?? ""} maxLength={160} /></Field>
          <Field label="Nome do contato" htmlFor="contact_name"><input className={inputClassName} id="contact_name" name="contact_name" defaultValue={client?.contact_name ?? ""} maxLength={160} /></Field>
          <Field label="E-mail" htmlFor="email" error={state.fieldErrors?.email}><input className={inputClassName} id="email" name="email" type="email" defaultValue={client?.email ?? ""} maxLength={254} /></Field>
          <Field label="Telefone" htmlFor="phone"><input className={inputClassName} id="phone" name="phone" type="tel" defaultValue={client?.phone ?? ""} maxLength={40} /></Field>
          <Field label="WhatsApp" htmlFor="whatsapp"><input className={inputClassName} id="whatsapp" name="whatsapp" type="tel" defaultValue={client?.whatsapp ?? ""} maxLength={40} /></Field>
          <Field label="Origem do contato" htmlFor="source"><input className={inputClassName} id="source" name="source" defaultValue={client?.source ?? ""} maxLength={160} placeholder="Indicação, site, evento..." /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold text-strong">Perfil e localização</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Segmento" htmlFor="segment"><input className={inputClassName} id="segment" name="segment" defaultValue={client?.segment ?? ""} maxLength={120} /></Field>
          <Field label="Cidade" htmlFor="city"><input className={inputClassName} id="city" name="city" defaultValue={client?.city ?? ""} maxLength={120} /></Field>
          <Field label="Estado" htmlFor="state" error={state.fieldErrors?.state}><input className={inputClassName} id="state" name="state" defaultValue={client?.state ?? ""} maxLength={2} placeholder="SP" /></Field>
          <Field label="País" htmlFor="country"><input className={inputClassName} id="country" name="country" defaultValue={client?.country ?? "Brasil"} maxLength={100} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Observações" htmlFor="notes"><textarea className={textareaClassName} id="notes" name="notes" defaultValue={client?.notes ?? ""} maxLength={4000} /></Field>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-muted hover:bg-soft">Cancelar</Link>
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60">
          {pending ? "Salvando..." : client ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
      </div>
    </form>
  );
}
