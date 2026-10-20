import assert from "node:assert/strict";
import test from "node:test";
import {
  getProjectDeadlineEventDetails,
  getProjectStatusEventDetails,
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
