import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveOpportunityState,
  isRecordInOrganization,
  parseActivityInput,
  parseClientInput,
  parseCurrency,
  parseOpportunityInput,
  validateLostReason,
} from "./validation.ts";

test("valida e normaliza o cadastro essencial de cliente", () => {
  const form = new FormData();
  form.set("name", "  Empresa Exemplo  ");
  form.set("kind", "company");
  form.set("status", "lead");
  form.set("tax_id", "12.345.678/0001-90");
  form.set("email", "CONTATO@EXEMPLO.COM");
  form.set("state", "sp");
  const result = parseClientInput(form);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Empresa Exemplo");
    assert.equal(result.data.tax_id, "12345678000190");
    assert.equal(result.data.email, "contato@exemplo.com");
    assert.equal(result.data.state, "SP");
  }
});

test("rejeita campos de cliente inválidos", () => {
  const form = new FormData();
  form.set("kind", "invalid");
  form.set("status", "active");
  form.set("email", "email-invalido");
  form.set("state", "São Paulo");
  const result = parseClientInput(form);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.fieldErrors.name);
    assert.ok(result.fieldErrors.kind);
    assert.ok(result.fieldErrors.email);
    assert.ok(result.fieldErrors.state);
  }
});

test("interpreta valores monetários brasileiros sem aceitar negativos", () => {
  assert.equal(parseCurrency("1.234,56"), 1234.56);
  assert.equal(parseCurrency(""), null);
  assert.equal(Number.isNaN(parseCurrency("abc")), true);
  const form = new FormData();
  form.set("title", "Projeto");
  form.set("pipeline_stage_id", "40000000-0000-4000-8000-000000000001");
  form.set("estimated_value", "-10");
  const result = parseOpportunityInput(form);
  assert.equal(result.success, false);
});

test("exige motivo somente para etapa perdida", () => {
  assert.equal(validateLostReason({ outcome: "lost" }, null), false);
  assert.equal(validateLostReason({ outcome: "lost" }, "Sem orçamento"), true);
  assert.equal(validateLostReason({ outcome: "open" }, null), true);
});

test("deriva estado coerente ao abrir, ganhar e perder", () => {
  const now = "2026-10-08T12:00:00.000Z";
  assert.deepEqual(deriveOpportunityState("open", "ignorar", now), { outcome: "open", closed_at: null, lost_reason: null });
  assert.deepEqual(deriveOpportunityState("won", "ignorar", now), { outcome: "won", closed_at: now, lost_reason: null });
  assert.deepEqual(deriveOpportunityState("lost", "Preço", now), { outcome: "lost", closed_at: now, lost_reason: "Preço" });
});

test("detecta tentativa de usar registro de outra organização", () => {
  assert.equal(isRecordInOrganization("org-a", "org-a"), true);
  assert.equal(isRecordInOrganization("org-b", "org-a"), false);
});

test("atividade rejeita oportunidade com identificador inválido", () => {
  const form = new FormData();
  form.set("activity_type", "meeting");
  form.set("description", "Reunião de descoberta");
  form.set("opportunity_id", "outra-organizacao");
  const result = parseActivityInput(form);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.fieldErrors.opportunity_id);
});
