import assert from "node:assert/strict";
import test from "node:test";
import { projectEventLabels, projectStageStatusLabels } from "./constants.ts";
import { formatProjectDate } from "./format.ts";
import {
  getProjectDeadlineEventDetails,
  getProjectStatusEventDetails,
  isTerminalProjectStatus,
  normalizeProgressPercent,
  projectEventActorName,
  projectStageResponsibleName,
  projectStagesAreEmpty,
  projectTaskProgressLabel,
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

test("reconhece os eventos de etapa sem alterar os rótulos anteriores", () => {
  assert.equal(projectEventLabels.created, "Projeto criado");
  assert.equal(projectEventLabels.stage_created, "Etapa criada");
  assert.equal(projectEventLabels.stage_updated, "Etapa alterada");
  assert.equal(projectEventLabels.stage_reordered, "Etapas reordenadas");
  assert.equal(projectEventLabels.stage_archived, "Etapa arquivada");
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
});

test("prioriza o nome histórico do ator e preserva fallback para eventos antigos", () => {
  assert.equal(projectEventActorName(" Nome preservado ", "Nome atual"), "Nome preservado");
  assert.equal(projectEventActorName(null, "Nome atual"), "Nome atual");
  assert.equal(projectEventActorName(null), "Membro indisponível");
});

test("formata datas planejadas e identifica projetos somente leitura", () => {
  assert.equal(formatProjectDate("2026-10-20"), "20/10/2026");
  assert.equal(formatProjectDate(null), "—");
  assert.equal(isTerminalProjectStatus("completed"), true);
  assert.equal(isTerminalProjectStatus("cancelled"), true);
  assert.equal(isTerminalProjectStatus("in_progress"), false);
});

test("identifica o estado vazio sem inventar etapas", () => {
  assert.equal(projectStagesAreEmpty([]), true);
  assert.equal(projectStagesAreEmpty([{ id: "stage" }]), false);
});
