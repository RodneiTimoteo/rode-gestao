"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import { getProjectStageTransitions, isProjectStageStatus } from "@/features/projects/presentation";
import type { ProjectActionState, ProjectStageReorderDirection, ProjectStageStatus, ProjectStatus } from "@/features/projects/types";
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
  if (error.message.includes("invalid stage status")) return "Esta mudança de situação da etapa não é permitida.";
  if (error.message.includes("stage name")) return "Informe um nome válido para a etapa.";
  if (error.message.includes("stage description")) return "A descrição da etapa é muito longa.";
  if (error.message.includes("stage deadline")) return "A data final não pode ser anterior à data inicial.";
  if (error.message.includes("stage responsible")) return "O responsável deve ser um membro ativo desta organização.";
  if (error.message.includes("archived stages")) return "Etapas arquivadas não podem ser editadas.";
  if (error.message.includes("stage not found")) return "Etapa não encontrada ou sem acesso.";
  if (error.message.includes("pending tasks")) return "Conclua ou cancele todas as tarefas da etapa antes de arquivá-la.";
  if (error.message.includes("ordered stages")) return "A ordem das etapas mudou. Atualize a página e tente novamente.";
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

export async function updateProjectStageAction(projectId: string, stageId: string, _state: ProjectActionState, formData: FormData): Promise<ProjectActionState> {
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  if (!isUuid(stageId)) return { status: "error", message: "Etapa inválida." };

  const parsed = parseProjectStageInput(formData);
  if (!parsed.success) return { status: "error", message: parsed.message, fieldErrors: parsed.fieldErrors };
  const expectedUpdatedAt = String(formData.get("expected_updated_at") ?? "").trim();
  if (!expectedUpdatedAt) return { status: "error", message: "Reabra a edição para carregar os dados atuais da etapa." };

  const { data: project, error: projectError } = await auth.context.supabase
    .from("projects")
    .select("id, status")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { status: "error", message: "Não foi possível validar o projeto agora. Tente novamente." };
  if (!project) return { status: "error", message: "Projeto não encontrado nesta organização." };
  if (project.status === "completed" || project.status === "cancelled") {
    return { status: "error", message: "Projetos concluídos ou cancelados não permitem editar etapas." };
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

  const { data: stage, error: stageError } = await auth.context.supabase
    .from("project_stages")
    .select("id, status, archived_at, updated_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("project_id", projectId)
    .eq("id", stageId)
    .maybeSingle();
  if (stageError) return { status: "error", message: "Não foi possível validar a etapa agora. Tente novamente." };
  if (!stage) return { status: "error", message: "Etapa não encontrada neste projeto." };
  if (stage.archived_at) return { status: "error", message: "Etapas arquivadas não podem ser editadas." };
  if (stage.updated_at !== expectedUpdatedAt) {
    return { status: "error", message: "Esta etapa foi alterada por outra operação. Reabra a edição para usar os dados atuais." };
  }

  const { data, error } = await auth.context.supabase.rpc("update_project_stage", {
    target_stage_id: stageId,
    target_name: parsed.data.name,
    target_description: parsed.data.description,
    target_status: stage.status,
    target_responsible_user_id: parsed.data.responsible_user_id,
    target_planned_start_date: parsed.data.planned_start_date,
    target_planned_end_date: parsed.data.planned_end_date,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  if (String(data) !== stageId) return { status: "error", message: "O banco não retornou uma etapa válida." };

  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Etapa atualizada com sucesso." };
}

export async function changeProjectStageStatusAction(
  projectId: string,
  stageId: string,
  nextStatus: ProjectStageStatus,
  _state: ProjectActionState,
  _formData: FormData,
): Promise<ProjectActionState> {
  void _state;
  void _formData;
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  if (!isUuid(stageId)) return { status: "error", message: "Etapa inválida." };
  if (!isProjectStageStatus(nextStatus)) return { status: "error", message: "Selecione uma situação válida para a etapa." };

  const { data: project, error: projectError } = await auth.context.supabase
    .from("projects")
    .select("id, status")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { status: "error", message: "Não foi possível validar o projeto agora. Tente novamente." };
  if (!project) return { status: "error", message: "Projeto não encontrado nesta organização." };
  if (project.status === "completed" || project.status === "cancelled") {
    return { status: "error", message: "Projetos concluídos ou cancelados não permitem alterar etapas." };
  }

  const { data: stage, error: stageError } = await auth.context.supabase
    .from("project_stages")
    .select("id, name, description, status, responsible_user_id, planned_start_date, planned_end_date, archived_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("project_id", projectId)
    .eq("id", stageId)
    .maybeSingle();
  if (stageError) return { status: "error", message: "Não foi possível validar a etapa agora. Tente novamente." };
  if (!stage) return { status: "error", message: "Etapa não encontrada neste projeto." };
  if (stage.archived_at) return { status: "error", message: "Etapas arquivadas não podem ser alteradas." };
  if (!isProjectStageStatus(stage.status)) return { status: "error", message: "A etapa possui uma situação inválida." };
  if (!getProjectStageTransitions(stage.status).includes(nextStatus)) {
    return { status: "error", message: "Esta mudança de situação da etapa não é permitida." };
  }

  const { data, error } = await auth.context.supabase.rpc("update_project_stage", {
    target_stage_id: stageId,
    target_name: stage.name,
    target_description: stage.description,
    target_status: nextStatus,
    target_responsible_user_id: stage.responsible_user_id,
    target_planned_start_date: stage.planned_start_date,
    target_planned_end_date: stage.planned_end_date,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  if (String(data) !== stageId) return { status: "error", message: "O banco não retornou uma etapa válida." };

  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Situação da etapa atualizada com sucesso." };
}

export async function archiveProjectStageAction(
  projectId: string,
  stageId: string,
  _state: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  if (!isUuid(stageId)) return { status: "error", message: "Etapa inválida." };
  if (formData.get("confirmation") !== "archive-project-stage") {
    return { status: "error", message: "Confirme explicitamente o arquivamento da etapa." };
  }

  const { data: project, error: projectError } = await auth.context.supabase
    .from("projects")
    .select("id, status")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { status: "error", message: "Não foi possível validar o projeto agora. Tente novamente." };
  if (!project) return { status: "error", message: "Projeto não encontrado nesta organização." };
  if (project.status === "completed" || project.status === "cancelled") {
    return { status: "error", message: "Projetos concluídos ou cancelados não permitem arquivar etapas." };
  }

  const { data: stage, error: stageError } = await auth.context.supabase
    .from("project_stages")
    .select("id, archived_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("project_id", projectId)
    .eq("id", stageId)
    .maybeSingle();
  if (stageError) return { status: "error", message: "Não foi possível validar a etapa agora. Tente novamente." };
  if (!stage) return { status: "error", message: "Etapa não encontrada neste projeto." };
  if (stage.archived_at) return { status: "error", message: "Esta etapa já está arquivada." };

  const { data: pendingTask, error: taskError } = await auth.context.supabase
    .from("project_tasks")
    .select("id")
    .eq("organization_id", auth.context.organization.id)
    .eq("project_id", projectId)
    .eq("project_stage_id", stageId)
    .not("status", "in", "(done,cancelled)")
    .limit(1)
    .maybeSingle();
  if (taskError) return { status: "error", message: "Não foi possível verificar as tarefas da etapa agora. Tente novamente." };
  if (pendingTask) {
    return { status: "error", message: "Conclua ou cancele todas as tarefas da etapa antes de arquivá-la." };
  }

  const { data, error } = await auth.context.supabase.rpc("archive_project_stage", { target_stage_id: stageId });
  if (error) return { status: "error", message: databaseMessage(error) };
  if (String(data) !== stageId) return { status: "error", message: "O banco não retornou uma etapa válida." };

  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  redirect(`/projetos/${projectId}?success=project-stage-archived`);
}

export async function reorderProjectStagesAction(
  projectId: string,
  stageId: string,
  direction: ProjectStageReorderDirection,
  _state: ProjectActionState,
  _formData: FormData,
): Promise<ProjectActionState> {
  void _state;
  void _formData;
  const auth = await projectContext();
  if (!auth.ok) return auth.state;
  if (!isUuid(projectId)) return { status: "error", message: "Projeto inválido." };
  if (!isUuid(stageId)) return { status: "error", message: "Etapa inválida." };
  if (direction !== "up" && direction !== "down") return { status: "error", message: "Direção de reordenação inválida." };

  const { data: project, error: projectError } = await auth.context.supabase
    .from("projects")
    .select("id, status")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return { status: "error", message: "Não foi possível validar o projeto agora. Tente novamente." };
  if (!project) return { status: "error", message: "Projeto não encontrado nesta organização." };
  if (project.status === "completed" || project.status === "cancelled") {
    return { status: "error", message: "Projetos concluídos ou cancelados não permitem reordenar etapas." };
  }

  const activeStageIds: string[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: stages, error: stagesError } = await auth.context.supabase
      .from("project_stages")
      .select("id")
      .eq("organization_id", auth.context.organization.id)
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("position", { ascending: true })
      .range(from, from + pageSize - 1);
    if (stagesError) return { status: "error", message: "Não foi possível carregar a ordem atual das etapas. Tente novamente." };
    const page = (stages ?? []) as Array<{ id: string }>;
    activeStageIds.push(...page.map((stage) => stage.id));
    if (page.length < pageSize) break;
  }

  const currentIndex = activeStageIds.indexOf(stageId);
  if (currentIndex < 0) return { status: "error", message: "Etapa não encontrada na lista ativa deste projeto." };
  if (activeStageIds.length === 1) return { status: "error", message: "A única etapa do projeto não pode ser reordenada." };
  if (direction === "up" && currentIndex === 0) return { status: "error", message: "A primeira etapa já está no início da lista." };
  if (direction === "down" && currentIndex === activeStageIds.length - 1) return { status: "error", message: "A última etapa já está no fim da lista." };

  const neighborIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  [activeStageIds[currentIndex], activeStageIds[neighborIndex]] = [activeStageIds[neighborIndex], activeStageIds[currentIndex]];

  const { data, error } = await auth.context.supabase.rpc("reorder_project_stages", {
    target_project_id: projectId,
    ordered_stage_ids: activeStageIds,
  });
  if (error) return { status: "error", message: databaseMessage(error) };
  if (String(data) !== projectId) return { status: "error", message: "O banco não confirmou a reordenação do projeto." };

  revalidatePath("/projetos");
  revalidatePath(`/projetos/${projectId}`);
  return { status: "success", message: "Ordem das etapas atualizada com sucesso." };
}
