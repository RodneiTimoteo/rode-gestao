"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import type { ProjectActionState, ProjectStatus } from "@/features/projects/types";
import {
  canTransitionProject,
  parseManualProjectInput,
  parseProjectStageInput,
  parseProposalProjectInput,
  validateDeadlineChange,
  validateStatusJustification,
} from "@/features/projects/validation";

function databaseMessage(error: PostgrestError) {
  if (error.code === "42501") return "Você não tem permissão para realizar esta operação.";
  if (error.code === "23503") return "Cliente, proposta ou responsável não pertence a esta organização.";
  if (error.code === "23505") return "Já existe um projeto vinculado a esta proposta.";
  if (error.message.includes("approved proposals")) return "Somente propostas aprovadas podem originar projetos.";
  if (error.message.includes("active member")) return "O responsável deve ser um membro ativo desta organização.";
  if (error.message.includes("terminal projects")) return "Projetos concluídos ou cancelados não podem ser alterados.";
  if (error.message.includes("invalid project status transition")) return "Esta mudança de situação não é permitida.";
  if (error.message.includes("stage name")) return "Informe um nome válido para a etapa.";
  if (error.message.includes("stage description")) return "A descrição da etapa é muito longa.";
  if (error.message.includes("stage deadline")) return "A data final não pode ser anterior à data inicial.";
  if (error.message.includes("stage responsible")) return "O responsável deve ser um membro ativo desta organização.";
  if (error.message.includes("deadline")) return "Revise o prazo e a justificativa informados.";
  return "Não foi possível concluir a operação agora. Tente novamente.";
}

async function projectContext(): Promise<
  | { ok: true; context: Awaited<ReturnType<typeof getCrmContext>> & { status: "ready" } }
  | { ok: false; state: ProjectActionState }
> {
  const context = await getCrmContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status !== "ready") return { ok: false, state: { status: "error", message: "Sua conta não possui uma organização ativa." } };
  return { ok: true, context };
}

export async function createManualProjectAction(_state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const parsed = parseManualProjectInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  const { data, error } = await auth.context.supabase.rpc("create_manual_project", {
    target_organization_id: auth.context.organization.id,
    target_client_id: parsed.data.client_id,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_owner_user_id: parsed.data.owner_user_id,
    target_start_date: parsed.data.start_date,
    target_expected_end_date: parsed.data.expected_end_date,
    target_contracted_amount: parsed.data.contracted_amount,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  const projectId = String(data);
  revalidatePath("/projetos");
  redirect(`/projetos/${projectId}?success=project-created`);
}

export async function createProjectFromProposalAction(proposalId: string, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const parsed = parseProposalProjectInput(proposalId, formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  const { data, error } = await auth.context.supabase.rpc("create_project_from_proposal", {
    target_organization_id: auth.context.organization.id,
    target_proposal_id: parsed.data.proposal_id,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_owner_user_id: parsed.data.owner_user_id,
    target_start_date: parsed.data.start_date,
    target_expected_end_date: parsed.data.expected_end_date,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  const result = data as { project_id?: string; created?: boolean } | null;
  if (!result?.project_id || !isUuid(result.project_id)) return { status: "error", message: "O banco não retornou um projeto válido." };
  revalidatePath("/projetos");
  revalidatePath(`/propostas/${proposalId}`);
  redirect(`/projetos/${result.project_id}?success=${result.created ? "project-from-proposal" : "project-existing"}`);
}

export async function changeProjectStatusAction(projectId: string, currentStatus: ProjectStatus, nextStatus: ProjectStatus, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  if (!canTransitionProject(currentStatus, nextStatus)) return { status: "error", message: "Esta mudança de situação não é permitida." };
  const justification = String(formData.get("justification") ?? "").trim().slice(0, 4000);
  const justificationError = validateStatusJustification(nextStatus, justification);
  if (justificationError) return { status: "error", message: justificationError, fieldErrors: { justification: justificationError } };
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  const { error } = await auth.context.supabase.rpc("change_project_status", {
    target_project_id: projectId,
    target_status: nextStatus,
    target_justification: justification || null,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Situação atualizada e registrada no histórico." };
}

export async function assignProjectOwnerAction(projectId: string, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  const ownerId = String(formData.get("owner_user_id") ?? "").trim();
  if (ownerId && !isUuid(ownerId)) return { status: "error", message: "Selecione um responsável válido.", fieldErrors: { owner_user_id: "Responsável inválido." } };
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  const { error } = await auth.context.supabase.rpc("assign_project_owner", { target_project_id: projectId, target_owner_user_id: ownerId || null });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Responsável atualizado e registrado no histórico." };
}

export async function changeProjectDeadlineAction(projectId: string, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  const date = String(formData.get("expected_end_date") ?? "").trim();
  const justification = String(formData.get("justification") ?? "").trim().slice(0, 4000);
  const fieldErrors = validateDeadlineChange(date, justification);
  if (fieldErrors) return { status: "error", message: "Informe a nova data e a justificativa.", fieldErrors };
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  const { error } = await auth.context.supabase.rpc("change_project_deadline", {
    target_project_id: projectId,
    target_expected_end_date: date,
    target_justification: justification,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Prazo alterado com justificativa registrada." };
}

export async function createProjectStageAction(projectId: string, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };

  const parsed = parseProjectStageInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };

  const { data: project, error: projectError } = await auth.context.supabase
    .from("projects")
    .select("id, status")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { status: "error", message: "Não foi possível validar o projeto agora. Tente novamente." };
  if (!project) return { status: "error", message: "Projeto não encontrado nesta organização." };
  if (project.status === "completed" || project.status === "cancelled") {
    return { status: "error", message: "Projetos concluídos ou cancelados não permitem novas etapas." };
  }

  if (parsed.data.responsible_user_id) {
    const { data: membership, error: membershipError } = await auth.context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", auth.context.organization.id)
      .eq("user_id", parsed.data.responsible_user_id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) return { status: "error", message: "Não foi possível validar o responsável agora. Tente novamente." };
    if (!membership) {
      return {
        status: "error",
        message: "Selecione um responsável ativo desta organização.",
        fieldErrors: { responsible_user_id: "Responsável inválido ou inativo." },
      };
    }
  }

  const { data, error } = await auth.context.supabase.rpc("create_project_stage", {
    target_project_id: projectId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_responsible_user_id: parsed.data.responsible_user_id,
    target_planned_start_date: parsed.data.planned_start_date,
    target_planned_end_date: parsed.data.planned_end_date,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  if (!isUuid(String(data))) return { status: "error", message: "O banco não retornou uma etapa válida." };

  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Etapa criada com sucesso." };
}
