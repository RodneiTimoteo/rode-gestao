"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import type { ProposalActionState, ProposalStatus } from "@/features/proposals/types";
import { canTransitionProposal, parseProposalInput, parseProposalOptionsInput } from "@/features/proposals/validation";

function databaseMessage(error: PostgrestError) {
  if (error.code === "42501") return "Você não tem permissão para realizar esta operação.";
  if (error.code === "23503") return "Cliente, oportunidade ou serviço não pertence a esta organização.";
  if (error.code === "23505") return "A revisão ou posição informada já existe. Atualize a página e tente novamente.";
  if (error.code === "22003" || error.code === "22P02" || error.code === "23514") return "Um dos valores informados está fora dos limites permitidos.";
  if (error.message.includes("terminal proposals")) return "Propostas encerradas são imutáveis. Crie uma revisão para continuar.";
  if (error.message.includes("invalid proposal status")) return "Esta mudança de status não é permitida.";
  if (error.message.includes("rejection reason")) return "Informe o motivo da rejeição.";
  if (error.message.includes("option") || error.message.includes("options")) return "A opção comercial informada não é válida para esta proposta.";
  return "Não foi possível concluir a operação agora. Tente novamente.";
}

export async function saveProposalOptionsAction(proposalId: string | null, _state: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  if (proposalId && !isUuid(proposalId)) return { status: "error", message: "Proposta inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  const parsed = parseProposalOptionsInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };

  const clientQuery = auth.context.supabase.from("clients").select("id").eq("organization_id", auth.context.organization.id).eq("id", parsed.data.client_id).maybeSingle();
  const opportunityQuery = parsed.data.opportunity_id
    ? auth.context.supabase.from("opportunities").select("id").eq("organization_id", auth.context.organization.id).eq("client_id", parsed.data.client_id).eq("id", parsed.data.opportunity_id).maybeSingle()
    : Promise.resolve({ data: { id: null }, error: null });
  const [client, opportunity] = await Promise.all([clientQuery, opportunityQuery]);
  if (client.error || !client.data) return { status: "error", message: "Cliente não encontrado nesta organização.", fieldErrors: { client_id: "Selecione outro cliente." } };
  if (opportunity.error || !opportunity.data) return { status: "error", message: "A oportunidade não pertence ao cliente selecionado.", fieldErrors: { opportunity_id: "Selecione outra oportunidade." } };

  const { data, error } = await auth.context.supabase.rpc("save_proposal_options_draft", {
    target_organization_id: auth.context.organization.id,
    target_proposal_id: proposalId,
    target_client_id: parsed.data.client_id,
    target_opportunity_id: parsed.data.opportunity_id,
    target_title: parsed.data.title,
    target_valid_until: parsed.data.valid_until,
    target_payment_terms: parsed.data.payment_terms,
    target_execution_deadline: parsed.data.execution_deadline,
    target_notes: parsed.data.notes,
    target_commercial_terms: parsed.data.commercial_terms,
    target_common_items: parsed.data.common_items,
    target_options: parsed.data.options,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  const savedId = String(data);
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${savedId}`);
  revalidatePath(`/clientes/${parsed.data.client_id}`);
  redirect(`/propostas/${savedId}?success=${proposalId ? "proposal-updated" : "proposal-created"}`);
}

export async function selectProposalOptionAction(proposalId: string, optionId: string, _state: ProposalActionState): Promise<ProposalActionState> {
  void _state;
  if (!isUuid(proposalId) || !isUuid(optionId)) return { status: "error", message: "Proposta ou opção inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  const { error } = await auth.context.supabase.rpc("select_proposal_option", {
    target_proposal_id: proposalId,
    target_option_id: optionId,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${proposalId}`);
  return { status: "success", message: "Opção comercial selecionada." };
}

export async function approveProposalOptionAction(proposalId: string, optionId: string, _state: ProposalActionState): Promise<ProposalActionState> {
  void _state;
  if (!isUuid(proposalId) || !isUuid(optionId)) return { status: "error", message: "Proposta ou opção inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  if (auth.context.organization.role !== "owner" && auth.context.organization.role !== "admin") {
    return { status: "error", message: "Somente owner e admin podem aprovar propostas." };
  }
  const { error } = await auth.context.supabase.rpc("approve_proposal_option", {
    target_proposal_id: proposalId,
    target_option_id: optionId,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${proposalId}`);
  return { status: "success", message: "Proposta aprovada com a opção selecionada." };
}

async function proposalContext(): Promise<
  | { ok: true; context: Awaited<ReturnType<typeof getCrmContext>> & { status: "ready" } }
  | { ok: false; state: ProposalActionState }
> {
  const context = await getCrmContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status !== "ready") return { ok: false, state: { status: "error", message: "Sua conta não possui uma organização ativa." } };
  return { ok: true, context };
}

export async function saveProposalAction(proposalId: string | null, _state: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  if (proposalId && !isUuid(proposalId)) return { status: "error", message: "Proposta inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  const parsed = parseProposalInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };

  const clientQuery = auth.context.supabase.from("clients").select("id").eq("organization_id", auth.context.organization.id).eq("id", parsed.data.client_id).maybeSingle();
  const opportunityQuery = parsed.data.opportunity_id
    ? auth.context.supabase.from("opportunities").select("id").eq("organization_id", auth.context.organization.id).eq("client_id", parsed.data.client_id).eq("id", parsed.data.opportunity_id).maybeSingle()
    : Promise.resolve({ data: { id: null }, error: null });
  const [client, opportunity] = await Promise.all([clientQuery, opportunityQuery]);
  if (client.error || !client.data) return { status: "error", message: "Cliente não encontrado nesta organização.", fieldErrors: { client_id: "Selecione outro cliente." } };
  if (opportunity.error || !opportunity.data) return { status: "error", message: "A oportunidade não pertence ao cliente selecionado.", fieldErrors: { opportunity_id: "Selecione outra oportunidade." } };

  const { data, error } = await auth.context.supabase.rpc("save_proposal_draft", {
    target_organization_id: auth.context.organization.id,
    target_proposal_id: proposalId,
    target_client_id: parsed.data.client_id,
    target_opportunity_id: parsed.data.opportunity_id,
    target_title: parsed.data.title,
    target_valid_until: parsed.data.valid_until,
    target_payment_terms: parsed.data.payment_terms,
    target_execution_deadline: parsed.data.execution_deadline,
    target_notes: parsed.data.notes,
    target_commercial_terms: parsed.data.commercial_terms,
    target_items: parsed.data.items,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  const savedId = String(data);
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${savedId}`);
  revalidatePath(`/clientes/${parsed.data.client_id}`);
  redirect(`/propostas/${savedId}?success=${proposalId ? "proposal-updated" : "proposal-created"}`);
}

export async function transitionProposalAction(proposalId: string, nextStatus: ProposalStatus, _state: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  if (!isUuid(proposalId)) return { status: "error", message: "Proposta inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  const { data: proposal, error: readError } = await auth.context.supabase.from("proposals").select("id, client_id, status").eq("organization_id", auth.context.organization.id).eq("id", proposalId).maybeSingle();
  if (readError || !proposal) return { status: "error", message: "Proposta não encontrada ou sem permissão de acesso." };
  const canApprove = auth.context.organization.role === "owner" || auth.context.organization.role === "admin";
  if (!canTransitionProposal(proposal.status as ProposalStatus, nextStatus, canApprove)) return { status: "error", message: nextStatus === "approved" && !canApprove ? "Somente owner e admin podem aprovar propostas." : "Esta mudança de status não é permitida." };

  let error: PostgrestError | null = null;
  if (nextStatus === "approved") {
    ({ error } = await auth.context.supabase.rpc("approve_proposal", { target_proposal_id: proposalId }));
  } else {
    const rejectionReason = nextStatus === "rejected" ? String(formData.get("rejection_reason") ?? "").trim().slice(0, 2000) : null;
    if (nextStatus === "rejected" && !rejectionReason) return { status: "error", message: "Informe o motivo da rejeição.", fieldErrors: { rejection_reason: "O motivo é obrigatório." } };
    const updateResult = await auth.context.supabase.from("proposals").update({ status: nextStatus, rejection_reason: rejectionReason }).eq("organization_id", auth.context.organization.id).eq("id", proposalId).select("id").maybeSingle();
    error = updateResult.error;
    if (!error && !updateResult.data) return { status: "error", message: "A proposta mudou ou sua permissão foi revogada. Atualize a página." };
  }
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/propostas");
  revalidatePath(`/propostas/${proposalId}`);
  revalidatePath(`/clientes/${proposal.client_id}`);
  return { status: "success", message: "Status da proposta atualizado." };
}

export async function createProposalRevisionAction(proposalId: string, _state: ProposalActionState, _formData: FormData): Promise<ProposalActionState> {
  void _state; void _formData;
  if (!isUuid(proposalId)) return { status: "error", message: "Proposta inválida." };
  const auth = await proposalContext();
  if (!auth.ok) return auth.state;
  const { data, error } = await auth.context.supabase.rpc("create_proposal_revision", { target_proposal_id: proposalId });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/propostas");
  redirect(`/propostas/${String(data)}/editar`);
}
