"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionState, PipelineStage } from "@/features/crm/types";
import { isUuid, parseActivityInput, parseClientInput, parseOpportunityInput, validateLostReason } from "@/features/crm/validation";
import { getCrmContext } from "@/features/crm/server/context";

function publicDatabaseMessage(error: PostgrestError) {
  if (error.code === "23505") return "Já existe um cadastro com estes dados. Revise CPF/CNPJ e demais campos únicos.";
  if (error.code === "23503") return "Um dos vínculos selecionados não pertence mais à organização.";
  if (error.code === "42501") return "Você não tem permissão para realizar esta operação.";
  return "Não foi possível salvar agora. Tente novamente.";
}

async function actionContext(): Promise<
  | { ok: true; context: Awaited<ReturnType<typeof getCrmContext>> & { status: "ready" } }
  | { ok: false; state: ActionState }
> {
  const context = await getCrmContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status !== "ready") {
    return {
      ok: false,
      state: { status: "error", message: "Sua conta não possui uma organização ativa." },
    };
  }
  return { ok: true, context };
}

async function validateMember(
  context: Awaited<ReturnType<typeof getCrmContext>> & { status: "ready" },
  userId: string | null,
) {
  if (!userId) return true;
  const { data, error } = await context.supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", context.organization.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !error && Boolean(data);
}

async function getStage(
  context: Awaited<ReturnType<typeof getCrmContext>> & { status: "ready" },
  stageId: string,
) {
  const { data, error } = await context.supabase
    .from("pipeline_stages")
    .select("id, organization_id, key, name, position, outcome, is_active")
    .eq("organization_id", context.organization.id)
    .eq("id", stageId)
    .eq("is_active", true)
    .maybeSingle();
  return error ? null : (data as PipelineStage | null);
}

export async function createClientAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const parsed = parseClientInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  if (!(await validateMember(auth.context, parsed.data.assigned_to))) {
    return { status: "error", message: "O responsável selecionado não é um membro ativo desta organização.", fieldErrors: { assigned_to: "Selecione outro responsável." } };
  }

  const { data, error } = await auth.context.supabase
    .from("clients")
    .insert({
      ...parsed.data,
      organization_id: auth.context.organization.id,
      created_by: auth.context.user.id,
      archived_at: parsed.data.status === "inactive" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: publicDatabaseMessage(error) };

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}?success=client-created`);
}

export async function updateClientAction(clientId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { status: "error", message: "Cliente inválido." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const parsed = parseClientInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  if (!(await validateMember(auth.context, parsed.data.assigned_to))) {
    return { status: "error", message: "O responsável selecionado não é um membro ativo desta organização.", fieldErrors: { assigned_to: "Selecione outro responsável." } };
  }

  const { data: existingClient, error: existingClientError } = await auth.context.supabase
    .from("clients")
    .select("id, archived_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", clientId)
    .maybeSingle();
  if (existingClientError) return { status: "error", message: publicDatabaseMessage(existingClientError) };
  if (!existingClient) return { status: "error", message: "Cliente não encontrado ou sem permissão de acesso." };

  const { data, error } = await auth.context.supabase
    .from("clients")
    .update({
      ...parsed.data,
      archived_at: parsed.data.status === "inactive" ? existingClient.archived_at ?? new Date().toISOString() : null,
    })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", clientId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: publicDatabaseMessage(error) };
  if (!data) return { status: "error", message: "Cliente não encontrado ou sem permissão de acesso." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?success=client-updated`);
}

export async function archiveClientAction(clientId: string, _state: ActionState): Promise<ActionState> {
  void _state;
  if (!isUuid(clientId)) return { status: "error", message: "Cliente inválido." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const { data, error } = await auth.context.supabase
    .from("clients")
    .update({ status: "inactive", archived_at: new Date().toISOString() })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", clientId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: publicDatabaseMessage(error) };
  if (!data) return { status: "error", message: "Cliente não encontrado ou sem permissão de acesso." };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
  return { status: "success", message: "Cliente arquivado como inativo." };
}

export async function createOpportunityAction(clientId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { status: "error", message: "Cliente inválido." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const parsed = parseOpportunityInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };

  const [clientResult, stage] = await Promise.all([
    auth.context.supabase
      .from("clients")
      .select("id")
      .eq("organization_id", auth.context.organization.id)
      .eq("id", clientId)
      .maybeSingle(),
    getStage(auth.context, parsed.data.pipeline_stage_id),
  ]);
  if (clientResult.error || !clientResult.data || !stage) return { status: "error", message: "Cliente ou etapa não encontrado nesta organização." };
  if (!(await validateMember(auth.context, parsed.data.owner_user_id))) return { status: "error", message: "O responsável selecionado não é um membro ativo." };
  if (!validateLostReason(stage, parsed.data.lost_reason)) return { status: "error", message: "Informe o motivo da perda.", fieldErrors: { lost_reason: "Obrigatório para oportunidades perdidas." } };

  const { error } = await auth.context.supabase.from("opportunities").insert({
    ...parsed.data,
    lost_reason: stage.outcome === "lost" ? parsed.data.lost_reason : null,
    organization_id: auth.context.organization.id,
    client_id: clientId,
    created_by: auth.context.user.id,
  });
  if (error) return { status: "error", message: publicDatabaseMessage(error) };

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes/funil");
  redirect(`/clientes/${clientId}?success=opportunity-created`);
}

export async function updateOpportunityAction(
  clientId: string,
  opportunityId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isUuid(clientId) || !isUuid(opportunityId)) return { status: "error", message: "Oportunidade inválida." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const parsed = parseOpportunityInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  const stage = await getStage(auth.context, parsed.data.pipeline_stage_id);
  if (!stage) return { status: "error", message: "Etapa não encontrada nesta organização." };
  if (!(await validateMember(auth.context, parsed.data.owner_user_id))) return { status: "error", message: "O responsável selecionado não é um membro ativo." };
  if (!validateLostReason(stage, parsed.data.lost_reason)) return { status: "error", message: "Informe o motivo da perda.", fieldErrors: { lost_reason: "Obrigatório para oportunidades perdidas." } };

  const { data, error } = await auth.context.supabase
    .from("opportunities")
    .update({ ...parsed.data, lost_reason: stage.outcome === "lost" ? parsed.data.lost_reason : null })
    .eq("organization_id", auth.context.organization.id)
    .eq("client_id", clientId)
    .eq("id", opportunityId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: publicDatabaseMessage(error) };
  if (!data) return { status: "error", message: "Oportunidade não encontrada ou sem permissão de acesso." };

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes/funil");
  redirect(`/clientes/${clientId}?success=opportunity-updated`);
}

export async function moveOpportunityAction(opportunityId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(opportunityId)) return { status: "error", message: "Oportunidade inválida." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const stageId = String(formData.get("pipeline_stage_id") ?? "");
  const lostReason = String(formData.get("lost_reason") ?? "").trim().slice(0, 1000) || null;
  if (!isUuid(stageId)) return { status: "error", message: "Selecione uma etapa válida." };
  const stage = await getStage(auth.context, stageId);
  if (!stage) return { status: "error", message: "Etapa não encontrada nesta organização." };
  if (!validateLostReason(stage, lostReason)) return { status: "error", message: "Informe o motivo antes de mover para uma etapa perdida." };

  const { data, error } = await auth.context.supabase
    .from("opportunities")
    .update({ pipeline_stage_id: stage.id, lost_reason: stage.outcome === "lost" ? lostReason : null })
    .eq("organization_id", auth.context.organization.id)
    .eq("id", opportunityId)
    .select("id, client_id")
    .maybeSingle();
  if (error) return { status: "error", message: publicDatabaseMessage(error) };
  if (!data) return { status: "error", message: "Oportunidade não encontrada ou sem permissão de acesso." };

  revalidatePath("/clientes/funil");
  revalidatePath(`/clientes/${data.client_id}`);
  return { status: "success", message: `Oportunidade movida para ${stage.name}.` };
}

export async function createActivityAction(clientId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(clientId)) return { status: "error", message: "Cliente inválido." };
  const auth = await actionContext();
  if (!auth.ok) return auth.state;
  const parsed = parseActivityInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };

  if (parsed.data.opportunity_id) {
    const { data, error } = await auth.context.supabase
      .from("opportunities")
      .select("id")
      .eq("organization_id", auth.context.organization.id)
      .eq("client_id", clientId)
      .eq("id", parsed.data.opportunity_id)
      .maybeSingle();
    if (error || !data) return { status: "error", message: "A oportunidade selecionada não pertence a este cliente." };
  }

  const { error } = await auth.context.supabase.from("client_activities").insert({
    ...parsed.data,
    organization_id: auth.context.organization.id,
    client_id: clientId,
    author_user_id: auth.context.user.id,
  });
  if (error) return { status: "error", message: publicDatabaseMessage(error) };

  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?success=activity-created`);
}
