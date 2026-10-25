import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionProject,
  parseManualProjectInput,
  parseProjectStageInput,
  parseProposalProjectInput,
  validateDeadlineChange,
  validateStatusJustification,
} from "./validation.ts";

const clientId = "31000000-0000-4000-8000-000000000001";
const proposalId = "51000000-0000-4000-8000-000000000001";
const memberId = "11000000-0000-4000-8000-000000000001";

function validManualForm() {
  const form = new FormData();
  form.set("client_id", clientId);
  form.set("name", "Implantação RODE");
  form.set("description", "Escopo contratado");
  form.set("owner_user_id", memberId);
  form.set("start_date", "2026-10-20");
  form.set("expected_end_date", "2026-12-20");
  form.set("contracted_amount", "12.345,67");
  return form;
}

test("normaliza o cadastro manual sem aceitar a organização do navegador", () => {
  const form = validManualForm();
  form.set("organization_id", "21000000-0000-4000-8000-000000000099");
  const result = parseManualProjectInput(form);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.client_id, clientId);
    assert.equal(result.data.contracted_amount, 12345.67);
    assert.equal("organization_id" in result.data, false);
  }
});

test("rejeita nome, cliente, responsável e datas inválidos", () => {
  const form = validManualForm();
  form.set("name", "   ");
  form.set("client_id", "externo");
  form.set("owner_user_id", "externo");
  form.set("expected_end_date", "2026-02-31");
  const result = parseManualProjectInput(form);
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["client_id", "expected_end_date", "name", "owner_user_id"]);
});

test("rejeita prazo anterior ao início e valor negativo", () => {
  const form = validManualForm();
  form.set("expected_end_date", "2026-10-19");
  form.set("contracted_amount", "-1,00");
  const result = parseManualProjectInput(form);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.fieldErrors.expected_end_date, /anterior/);
    assert.match(result.fieldErrors.contracted_amount, /válido/);
  }
});

test("valida confirmação de projeto a partir de revisão específica", () => {
  const result = parseProposalProjectInput(proposalId, validManualForm());
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.proposal_id, proposalId);
  assert.equal(parseProposalProjectInput("proposta-inválida", validManualForm()).success, false);
});

test("espelha as transições oficiais protegidas pelo banco", () => {
  assert.equal(canTransitionProject("planning", "in_progress"), true);
  assert.equal(canTransitionProject("in_progress", "completed"), true);
  assert.equal(canTransitionProject("paused", "completed"), false);
  assert.equal(canTransitionProject("completed", "in_progress"), false);
  assert.equal(canTransitionProject("cancelled", "planning"), false);
});

test("exige motivo para pausa, espera do cliente e qualquer alteração de prazo", () => {
  assert.match(validateStatusJustification("paused", "") ?? "", /motivo/);
  assert.match(validateStatusJustification("awaiting_client", "   ") ?? "", /motivo/);
  assert.equal(validateStatusJustification("in_progress", ""), null);
  assert.deepEqual(validateDeadlineChange("2026-12-20", ""), { justification: "A justificativa é obrigatória." });
  assert.deepEqual(validateDeadlineChange("inválida", "Motivo"), { expected_end_date: "Informe uma nova data válida." });
  assert.equal(validateDeadlineChange("2026-12-20", "Pedido formal do cliente"), null);
});

test("normaliza os dados válidos de uma nova etapa", () => {
  const form = new FormData();
  form.set("name", "  Descoberta  ");
  form.set("description", "  Levantamento inicial  ");
  form.set("responsible_user_id", memberId);
  form.set("planned_start_date", "2026-10-25");
  form.set("planned_end_date", "2026-10-31");
  const result = parseProjectStageInput(form);
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, {
    name: "Descoberta",
    description: "Levantamento inicial",
    responsible_user_id: memberId,
    planned_start_date: "2026-10-25",
    planned_end_date: "2026-10-31",
  });
});

test("rejeita nome ausente ou maior que 200 caracteres e descrição acima do limite", () => {
  const empty = new FormData();
  empty.set("name", "   ");
  const emptyResult = parseProjectStageInput(empty);
  assert.equal(emptyResult.success, false);
  if (!emptyResult.success) assert.match(emptyResult.fieldErrors.name, /1 e 200/);

  const long = new FormData();
  long.set("name", "A".repeat(201));
  long.set("description", "B".repeat(8001));
  const longResult = parseProjectStageInput(long);
  assert.equal(longResult.success, false);
  if (!longResult.success) assert.deepEqual(Object.keys(longResult.fieldErrors).sort(), ["description", "name"]);
});

test("rejeita responsável, datas e intervalo planejado inválidos", () => {
  const form = new FormData();
  form.set("name", "Execução");
  form.set("responsible_user_id", "membro-externo");
  form.set("planned_start_date", "2026-02-31");
  form.set("planned_end_date", "data-inválida");
  const invalid = parseProjectStageInput(form);
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.deepEqual(Object.keys(invalid.fieldErrors).sort(), ["planned_end_date", "planned_start_date", "responsible_user_id"]);

  form.set("responsible_user_id", "");
  form.set("planned_start_date", "2026-11-02");
  form.set("planned_end_date", "2026-11-01");
  const reversed = parseProjectStageInput(form);
  assert.equal(reversed.success, false);
  if (!reversed.success) assert.match(reversed.fieldErrors.planned_end_date, /anterior/);
});
