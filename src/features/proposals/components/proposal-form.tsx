"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import { calculateProposalLineTotal, calculateProposalPreview } from "@/features/proposals/calculations";
import { formatCurrency } from "@/features/proposals/format";
import type { ProposalActionState, ProposalClientOption, ProposalDetails, ProposalFormItem, ProposalOpportunityOption, ServiceOption } from "@/features/proposals/types";

const initialState: ProposalActionState = { status: "idle", message: "" };
const newItem = (): ProposalFormItem => ({ service_id: null, service_name: "", description: "", quantity: 1, unit_price: 0, discount_amount: 0 });

export function ProposalForm({ action, clients, opportunities, services, proposal, initialClientId, cancelHref }: {
  action: (state: ProposalActionState, payload: FormData) => Promise<ProposalActionState>;
  clients: ProposalClientOption[]; opportunities: ProposalOpportunityOption[]; services: ServiceOption[];
  proposal?: ProposalDetails; initialClientId?: string; cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [clientId, setClientId] = useState(proposal?.client_id ?? initialClientId ?? "");
  const [opportunityId, setOpportunityId] = useState(proposal?.opportunity_id ?? "");
  const [items, setItems] = useState<ProposalFormItem[]>(proposal?.items.map((item) => ({ id: item.id, service_id: item.service_id, service_name: item.service_name_snapshot, description: item.description, quantity: Number(item.quantity), unit_price: Number(item.unit_price), discount_amount: Number(item.discount_amount) })) ?? [newItem()]);
  const availableOpportunities = opportunities.filter((item) => item.client_id === clientId);
  if (proposal?.opportunity && !availableOpportunities.some((item) => item.id === proposal.opportunity?.id)) {
    availableOpportunities.unshift({ id: proposal.opportunity.id, client_id: proposal.client_id, title: `${proposal.opportunity.title} (arquivada)` });
  }
  const totals = useMemo(() => calculateProposalPreview(items), [items]);
  const updateItem = (index: number, patch: Partial<ProposalFormItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const chooseService = (index: number, serviceId: string) => { const service = services.find((item) => item.id === serviceId); updateItem(index, service ? { service_id: service.id, service_name: service.name, description: service.description ?? service.name, unit_price: Number(service.reference_price ?? 0) } : { service_id: null }); };

  return <form action={formAction} className="space-y-5">
    <FormMessage status={state.status} message={state.message} />
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-base font-semibold text-strong">Identificação</h2><p className="mt-1 text-sm text-muted">O código será gerado automaticamente pelo banco.</p><div className="mt-5 grid gap-4 md:grid-cols-2">
      <Field label="Cliente *" htmlFor="client_id" error={state.fieldErrors?.client_id}>{proposal ? <><input type="hidden" name="client_id" value={proposal.client_id} /><select id="client_id" className={inputClassName} value={proposal.client_id} disabled><option value={proposal.client_id}>{proposal.clientName}</option></select></> : <select id="client_id" name="client_id" className={inputClassName} value={clientId} onChange={(event) => { setClientId(event.target.value); setOpportunityId(""); }} required><option value="">Selecione</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>}</Field>
      <Field label="Oportunidade" htmlFor="opportunity_id" error={state.fieldErrors?.opportunity_id}><select id="opportunity_id" name="opportunity_id" className={inputClassName} value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} disabled={!clientId}><option value="">{clientId ? "Sem oportunidade vinculada" : "Selecione primeiro o cliente"}</option>{availableOpportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</select></Field>
      <div className="md:col-span-2"><Field label="Título *" htmlFor="title" error={state.fieldErrors?.title}><input id="title" name="title" className={inputClassName} defaultValue={proposal?.title ?? ""} required maxLength={180} autoFocus /></Field></div>
      <Field label="Validade" htmlFor="valid_until" error={state.fieldErrors?.valid_until}><input id="valid_until" name="valid_until" type="date" className={inputClassName} defaultValue={proposal?.valid_until ?? ""} /></Field>
      <Field label="Prazo de execução" htmlFor="execution_deadline" hint="Descreva o prazo e a unidade combinada, sem assumir dias úteis ou corridos."><input id="execution_deadline" name="execution_deadline" className={inputClassName} defaultValue={proposal?.execution_deadline ?? ""} maxLength={1000} placeholder="Ex.: 30 dias após aprovação" /></Field>
    </div></section>

    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-strong">Itens e serviços</h2><p className="mt-1 text-sm text-muted">Valores abaixo são uma prévia; o PostgreSQL calculará os totais oficiais.</p></div><button type="button" onClick={() => setItems((current) => [...current, newItem()])} className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">+ Item</button></div>{state.fieldErrors?.items && <p className="mt-3 text-sm text-danger">{state.fieldErrors.items}</p>}
      <div className="mt-5 space-y-4">{items.map((item, index) => <fieldset key={item.id ?? index} className="rounded-xl border border-line bg-soft/40 p-4"><legend className="sr-only">Item {index + 1}</legend><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-strong">Item {index + 1}</p>{items.length > 1 && <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-soft" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remover item</button>}</div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-strong">Serviço cadastrado</span><select className={inputClassName} value={services.some((service) => service.id === item.service_id) ? item.service_id ?? "" : ""} onChange={(event) => chooseService(index, event.target.value)}><option value="">Item personalizado</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}{service.reference_price !== null ? ` · ${formatCurrency(service.reference_price)}` : ""}</option>)}</select></label>
        <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-strong">Nome *</span><input className={inputClassName} value={item.service_name} onChange={(event) => updateItem(index, { service_name: event.target.value })} maxLength={200} required /></label>
        <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-medium text-strong">Descrição *</span><input className={inputClassName} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} maxLength={4000} required /></label>
        <label><span className="mb-1.5 block text-sm font-medium text-strong">Quantidade *</span><input className={inputClassName} type="number" min="0.001" max="99999999999.999" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} required /></label>
        <label><span className="mb-1.5 block text-sm font-medium text-strong">Valor unitário *</span><input className={inputClassName} type="number" min="0" max="999999999999.99" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} required /></label>
        <label><span className="mb-1.5 block text-sm font-medium text-strong">Desconto (R$)</span><input className={inputClassName} type="number" min="0" max="999999999999.99" step="0.01" value={item.discount_amount} onChange={(event) => updateItem(index, { discount_amount: Number(event.target.value) })} /></label><div className="self-end rounded-xl border border-line bg-surface px-3 py-3 text-sm"><span className="text-subtle">Total do item </span><strong className="text-strong">{formatCurrency(Math.max(0, calculateProposalLineTotal(item)))}</strong></div>
      </div></fieldset>)}</div>
      <dl className="mt-5 ml-auto grid max-w-md gap-2 rounded-xl bg-soft p-4 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="font-medium text-strong">{formatCurrency(totals.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-muted">Descontos</dt><dd className="font-medium text-danger">− {formatCurrency(totals.discount)}</dd></div><div className="flex justify-between border-t border-line pt-2"><dt className="font-semibold text-strong">Total previsto</dt><dd className="text-base font-semibold text-brand">{formatCurrency(totals.total)}</dd></div></dl>
    </section>

    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h2 className="text-base font-semibold text-strong">Condições comerciais</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Condições de pagamento" htmlFor="payment_terms"><textarea id="payment_terms" name="payment_terms" className={textareaClassName} defaultValue={proposal?.payment_terms ?? ""} maxLength={4000} /></Field><Field label="Termos comerciais" htmlFor="commercial_terms"><textarea id="commercial_terms" name="commercial_terms" className={textareaClassName} defaultValue={proposal?.commercial_terms ?? ""} maxLength={8000} /></Field><div className="md:col-span-2"><Field label="Observações" htmlFor="notes"><textarea id="notes" name="notes" className={textareaClassName} defaultValue={proposal?.notes ?? ""} maxLength={4000} /></Field></div></div></section>
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href={cancelHref} className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-muted hover:bg-soft">Cancelar</Link><button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60">{pending ? "Salvando..." : "Salvar rascunho"}</button></div>
  </form>;
}
