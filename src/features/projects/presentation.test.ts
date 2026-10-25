import assert from "node:assert/strict";
import test from "node:test";
import { projectEventLabels, projectStageStatusLabels, projectTaskDefaultPriority, projectTaskPriorityLabels, projectTaskStatusLabels } from "./constants.ts";
import { formatProjectDate } from "./format.ts";
import {
  getProjectDeadlineEventDetails,
  getProjectStageStatusEventDetails,
  getProjectStageTransitions,
  getProjectTaskStatusEventDetails,
  getProjectStatusEventDetails,
  isProjectStageStatus,
  isTerminalProjectStatus,
  groupProjectTasksByStage,
  normalizeProgressPercent,
  projectEventActorName,
  projectStageResponsibleName,
  projectStageReorderAvailability,
  projectStageTransitionLabel,
  projectStagesAreEmpty,
  projectTaskProgressLabel,
  projectTaskAssigneeName,
  projectTransitionActionLabel,
  translateProjectStatusDescription,
} from "./presentation.ts";

test("traduz os códigos de situação em descrições históricas", () => {
  assert.equal(
    translateProjectStatusDescription("Situação alterada de paused para in_progress"),
    "Situação alterada de Pausado para Em andamento",
  );
  assert.equal(
    translateProjectStatusDescription("Situação alterada de awaiting_client para completed"),
    "Situação alterada de Aguardando aprovação do cliente para Concluído",
  );
});

test("apresenta os dados estruturados de situação sem expor códigos internos", () => {
  assert.deepEqual(getProjectStatusEventDetails({ from: "planning", to: "in_progress" }), {
    from: "Planejamento",
    to: "Em andamento",
  });
  assert.deepEqual(getProjectStatusEventDetails({ from: null, to: "situação-desconhecida" }), {
    from: null,
    to: null,
  });
});

test("tolera eventos históricos de prazo incompletos", () => {
  assert.deepEqual(getProjectDeadlineEventDetails({ from: "2026-11-10", to: "2026-11-20" }), {
    from: "2026-11-10",
    to: "2026-11-20",
  });
  assert.deepEqual(getProjectDeadlineEventDetails({ from: null, to: 123 }), {
    from: null,
    to: null,
  });
});

test("usa rótulos de ação claros conforme a transição", () => {
  assert.equal(projectTransitionActionLabel("planning", "in_progress"), "Iniciar projeto");
  assert.equal(projectTransitionActionLabel("paused", "in_progress"), "Retomar projeto");
  assert.equal(projectTransitionActionLabel("in_progress", "completed"), "Concluir projeto");
});

test("apresenta os quatro estados operacionais das etapas", () => {
  assert.deepEqual(projectStageStatusLabels, {
    pending: "Pendente",
    in_progress: "Em andamento",
    completed: "Concluída",
    skipped: "Pulada",
  });
});

test("oferece somente as transições permitidas com rótulos claros", () => {
  assert.deepEqual(getProjectStageTransitions("pending"), ["in_progress", "skipped"]);
  assert.deepEqual(getProjectStageTransitions("in_progress"), ["pending", "completed", "skipped"]);
  assert.deepEqual(getProjectStageTransitions("completed"), ["in_progress"]);
  assert.deepEqual(getProjectStageTransitions("skipped"), ["pending"]);
  assert.equal(projectStageTransitionLabel("pending", "in_progress"), "Iniciar etapa");
  assert.equal(projectStageTransitionLabel("completed", "in_progress"), "Reabrir etapa");
  assert.equal(projectStageTransitionLabel("skipped", "pending"), "Reativar como pendente");
  assert.equal(isProjectStageStatus(null), false);
  assert.equal(isProjectStageStatus("unknown"), false);
});

test("traduz a mudança de situação registrada no evento stage_updated", () => {
  assert.deepEqual(getProjectStageStatusEventDetails({
    from: { status: "in_progress", name: "Execução" },
    to: { status: "completed", name: "Execução" },
  }), { from: "Em andamento", to: "Concluída" });
  assert.deepEqual(getProjectStageStatusEventDetails({ from: null, to: { status: "unknown" } }), { from: null, to: null });
});

test("reconhece os eventos de etapa sem alterar os rótulos anteriores", () => {
  assert.equal(projectEventLabels.created, "Projeto criado");
  assert.equal(projectEventLabels.stage_created, "Etapa criada");
  assert.equal(projectEventLabels.stage_updated, "Etapa alterada");
  assert.equal(projectEventLabels.stage_reordered, "Etapas reordenadas");
  assert.equal(projectEventLabels.stage_archived, "Etapa arquivada");
});

test("reconhece os eventos de tarefa e traduz mudanças de situação", () => {
  assert.deepEqual(
    ["task_created", "task_updated", "task_status_changed", "task_completed", "task_reopened", "task_assignee_changed", "task_deadline_changed", "task_reordered"].map((event) => projectEventLabels[event as keyof typeof projectEventLabels]),
    ["Tarefa criada", "Tarefa alterada", "Situação da tarefa alterada", "Tarefa concluída", "Tarefa reaberta", "Responsável da tarefa alterado", "Prazo da tarefa alterado", "Tarefas reordenadas"],
  );
  assert.deepEqual(getProjectTaskStatusEventDetails({ from: "blocked", to: "done" }), { from: "Bloqueada", to: "Concluída" });
  assert.deepEqual(getProjectTaskStatusEventDetails({ from: null, to: "unknown" }), { from: null, to: null });
});

test("apresenta todas as situações e prioridades de tarefa", () => {
  assert.deepEqual(projectTaskStatusLabels, {
    todo: "A fazer", in_progress: "Em andamento", blocked: "Bloqueada", done: "Concluída", cancelled: "Cancelada",
  });
  assert.deepEqual(projectTaskPriorityLabels, { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" });
  assert.equal(projectTaskDefaultPriority, "medium");
});

test("normaliza progresso e descreve as quantidades de tarefas", () => {
  assert.equal(normalizeProgressPercent(33.4), 33);
  assert.equal(normalizeProgressPercent(150), 100);
  assert.equal(normalizeProgressPercent(Number.NaN), 0);
  assert.equal(projectTaskProgressLabel(1, 1), "1 de 1 tarefa concluída");
  assert.equal(projectTaskProgressLabel(2, 3), "2 de 3 tarefas concluídas");
});

test("resolve responsável ativo e mantém fallback seguro", () => {
  const members = [{ userId: "10000000-0000-4000-8000-000000000001", displayName: "Ana", role: "member" as const }];
  assert.equal(projectStageResponsibleName(null, members), "Não atribuído");
  assert.equal(projectStageResponsibleName(members[0].userId, members), "Ana");
  assert.equal(projectStageResponsibleName("10000000-0000-4000-8000-000000000099", members), "Membro indisponível");
  assert.equal(projectTaskAssigneeName(null, members), "Não atribuído");
  assert.equal(projectTaskAssigneeName(members[0].userId, members), "Ana");
  assert.equal(projectTaskAssigneeName("10000000-0000-4000-8000-000000000099", members), "Membro indisponível");
});

test("prioriza o nome histórico do ator e preserva fallback para eventos antigos", () => {
  assert.equal(projectEventActorName(" Nome preservado ", "Nome atual"), "Nome preservado");
  assert.equal(projectEventActorName(null, "Nome atual"), "Nome atual");
  assert.equal(projectEventActorName(null), "Membro indisponível");
});

test("formata datas planejadas e identifica projetos somente leitura", () => {
  assert.equal(formatProjectDate("2026-10-20"), "20/10/2026");
  assert.equal(formatProjectDate(null), "—");
  assert.notEqual(formatProjectDate("2026-10-25T12:00:00Z", true), "—");
  assert.equal(isTerminalProjectStatus("completed"), true);
  assert.equal(isTerminalProjectStatus("cancelled"), true);
  assert.equal(isTerminalProjectStatus("in_progress"), false);
});

test("identifica o estado vazio sem inventar etapas", () => {
  assert.equal(projectStagesAreEmpty([]), true);
  assert.equal(projectStagesAreEmpty([{ id: "stage" }]), false);
});

test("habilita os controles de reordenação somente quando existe uma etapa vizinha", () => {
  assert.deepEqual(projectStageReorderAvailability(0, 3), { canMoveUp: false, canMoveDown: true });
  assert.deepEqual(projectStageReorderAvailability(1, 3), { canMoveUp: true, canMoveDown: true });
  assert.deepEqual(projectStageReorderAvailability(2, 3), { canMoveUp: true, canMoveDown: false });
  assert.deepEqual(projectStageReorderAvailability(0, 1), { canMoveUp: false, canMoveDown: false });
  assert.deepEqual(projectStageReorderAvailability(0, 0), { canMoveUp: false, canMoveDown: false });
});

test("agrupa tarefas por etapa e preserva a ordem de posição", () => {
  const base = {
    organization_id: "org", project_id: "project", title: "Tarefa", description: null,
    status: "todo" as const, priority: "medium" as const, assigned_to: null, due_date: null,
    completed_at: null, created_at: "2026-10-25T12:00:00Z", updated_at: "2026-10-25T12:00:00Z",
  };
  const grouped = groupProjectTasksByStage([
    { ...base, id: "task-2", project_stage_id: "stage-a", position: 2 },
    { ...base, id: "task-3", project_stage_id: "stage-b", position: 1 },
    { ...base, id: "task-1", project_stage_id: "stage-a", position: 1 },
  ]);
  assert.deepEqual(grouped.get("stage-a")?.map((task) => task.id), ["task-1", "task-2"]);
  assert.deepEqual(grouped.get("stage-b")?.map((task) => task.id), ["task-3"]);
  assert.equal(grouped.has("stage-empty"), false);
});
