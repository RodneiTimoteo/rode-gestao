import assert from "node:assert/strict";
import test from "node:test";
import { calculateProposalLineTotal, calculateProposalPreview } from "./calculations.ts";
import { canReplaceAttachment, canTransitionProposal, parseProposalInput, validatePdfFile } from "./validation.ts";

function validForm() {
  const form = new FormData();
  form.set("client_id", "31000000-0000-4000-8000-000000000001");
  form.set("title", "Proposta de consultoria");
  form.set("items", JSON.stringify([{ service_id: null, service_name: "Consultoria", description: "Execução", quantity: 2, unit_price: 500, discount_amount: 100 }]));
  return form;
}

test("valida e normaliza proposta e itens", () => {
  const result = parseProposalInput(validForm());
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data.items[0], { service_id: null, service_name: "Consultoria", description: "Execução", quantity: 2, unit_price: 500, discount_amount: 100 });
});

test("rejeita item sem descrição e desconto acima do total", () => {
  const form = validForm();
  form.set("items", JSON.stringify([{ service_name: "X", description: "", quantity: 1, unit_price: 10, discount_amount: 11 }]));
  const result = parseProposalInput(form);
  assert.equal(result.success, false);
});

test("normaliza as escalas numéricas antes de persistir", () => {
  const form = validForm();
  form.set("items", JSON.stringify([{ service_name: "X", description: "Y", quantity: 1.23456, unit_price: 10.005, discount_amount: 0.004 }]));
  const result = parseProposalInput(form);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.items[0].quantity, 1.235);
    assert.equal(result.data.items[0].unit_price, 10.01);
    assert.equal(result.data.items[0].discount_amount, 0);
  }
});

test("prévia segue o arredondamento agregado do PostgreSQL", () => {
  const items = [
    { service_id: null, service_name: "A", description: "A", quantity: 0.333, unit_price: 0.05, discount_amount: 0 },
    { service_id: null, service_name: "B", description: "B", quantity: 0.333, unit_price: 0.05, discount_amount: 0 },
  ];
  assert.equal(calculateProposalLineTotal(items[0]), 0.02);
  assert.deepEqual(calculateProposalPreview(items), { subtotal: 0.03, discount: 0, total: 0.03 });
});

test("valida desconto contra o valor bruto arredondado pelo banco", () => {
  const accepted = validForm();
  accepted.set("items", JSON.stringify([{ service_name: "X", description: "Y", quantity: 0.333, unit_price: 0.05, discount_amount: 0.02 }]));
  assert.equal(parseProposalInput(accepted).success, true);
  const rejected = validForm();
  rejected.set("items", JSON.stringify([{ service_name: "X", description: "Y", quantity: 0.333, unit_price: 0.05, discount_amount: 0.03 }]));
  assert.equal(parseProposalInput(rejected).success, false);
});

test("rejeita data impossível e valores acima da precisão do banco", () => {
  const invalidDate = validForm();
  invalidDate.set("valid_until", "2026-02-31");
  assert.equal(parseProposalInput(invalidDate).success, false);
  const overflow = validForm();
  overflow.set("items", JSON.stringify([{ service_name: "X", description: "Y", quantity: 100_000_000_000, unit_price: 1, discount_amount: 0 }]));
  assert.equal(parseProposalInput(overflow).success, false);
});

test("restringe aprovação a papel autorizado sem liberar transições inválidas", () => {
  assert.equal(canTransitionProposal("sent", "approved", false), false);
  assert.equal(canTransitionProposal("sent", "approved", true), true);
  assert.equal(canTransitionProposal("draft", "approved", true), false);
  assert.equal(canTransitionProposal("sent", "negotiating", false), true);
});

test("valida extensão, MIME, tamanho e assinatura de PDF", () => {
  const signature = new TextEncoder().encode("%PDF-1.7\nobj\n%%EOF");
  assert.equal(validatePdfFile({ name: "proposta.pdf", type: "application/pdf", size: 100 }, signature), null);
  assert.match(validatePdfFile({ name: "proposta.pdf", type: "application/pdf", size: 100 }, new Uint8Array([1, 2])) ?? "", /assinatura/);
  assert.match(validatePdfFile({ name: "proposta.exe", type: "application/pdf", size: 100 }, signature) ?? "", /extensão/);
  assert.match(validatePdfFile({ name: "proposta.pdf", type: "application/pdf", size: 100 }, new TextEncoder().encode("%PDF-1.7")) ?? "", /estrutura/);
});

test("limita substituição ao autor do documento ou administradores", () => {
  assert.equal(canReplaceAttachment("member", "user-a", "user-a"), true);
  assert.equal(canReplaceAttachment("member", "user-a", "user-b"), false);
  assert.equal(canReplaceAttachment("admin", "user-a", "user-b"), true);
  assert.equal(canReplaceAttachment("owner", "user-a", "user-b"), true);
});
