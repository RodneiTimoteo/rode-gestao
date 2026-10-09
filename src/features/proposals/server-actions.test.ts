import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { after, before, beforeEach, describe, it, mock } from "node:test";

const contextModule = pathToFileURL(resolve("src/features/crm/server/context.ts")).href;
const mockModule = mock.module.bind(mock) as unknown as (specifier: string, options: { exports: Record<string, unknown> }) => void;
let currentContext: unknown;
const revalidated: string[] = [];

class RedirectSignal extends Error {
  location: string;
  constructor(location: string) { super(`redirect:${location}`); this.location = location; }
}

before(async () => {
  mockModule(contextModule, {
    exports: { getCrmContext: async () => currentContext },
  });
  mockModule("next/cache", {
    exports: { revalidatePath: (path: string) => revalidated.push(path) },
  });
  mockModule("next/navigation", {
    exports: { redirect: (location: string) => { throw new RedirectSignal(location); } },
  });
});

beforeEach(() => {
  currentContext = undefined;
  revalidated.length = 0;
});

after(() => mock.restoreAll());

function uuid(seed: string) {
  return `${seed.padStart(8, "0").slice(-8)}-0000-4000-8000-000000000000`;
}

function validProposalForm() {
  const data = new FormData();
  data.set("client_id", uuid("1"));
  data.set("title", "QA Etapa 4B");
  data.set("valid_until", "2026-12-31");
  data.set("items", JSON.stringify([{ service_id: null, service_name: "Consultoria", description: "Item de QA", quantity: 2, unit_price: 150, discount_amount: 10 }]));
  return data;
}

function validOptionsForm() {
  const data = new FormData();
  data.set("client_id", uuid("1"));
  data.set("title", "QA com opções");
  data.set("common_items", JSON.stringify([{ service_name: "Comum", description: "Base", quantity: 1, unit_price: 100, discount_amount: 0 }]));
  data.set("options", JSON.stringify([
    { name: "Essencial", items: [{ service_name: "A", description: "A", quantity: 1, unit_price: 50, discount_amount: 0 }] },
    { name: "Completa", items: [{ service_name: "B", description: "B", quantity: 1, unit_price: 100, discount_amount: 0 }] },
  ]));
  return data;
}

function queryResult(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
    then: (resolvePromise: (value: unknown) => void) => resolvePromise(result),
  };
  return query;
}

describe("Server Actions de propostas com Supabase mockado", () => {
  it("redireciona uma sessão ausente sem executar escrita", async () => {
    currentContext = { status: "unauthenticated" };
    const { saveProposalAction } = await import("./actions.ts");
    await assert.rejects(() => saveProposalAction(null, { status: "idle", message: "" }, validProposalForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login");
  });

  it("valida cliente e oportunidade na organização antes de salvar", async () => {
    const calls: unknown[] = [];
    const supabase = {
      from: (table: string) => queryResult(table === "clients" ? { data: { id: uuid("1") }, error: null } : { data: { id: uuid("2") }, error: null }),
      rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: uuid("9"), error: null }; },
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { saveProposalAction } = await import("./actions.ts");

    await assert.rejects(() => saveProposalAction(null, { status: "idle", message: "" }, validProposalForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/propostas/${uuid("9")}?success=proposal-created`);
    assert.equal(calls.length, 1);
    assert.equal((calls[0] as [string])[0], "save_proposal_draft");
    assert.deepEqual(revalidated, ["/propostas", `/propostas/${uuid("9")}`, `/clientes/${uuid("1")}`]);
  });

  it("não chama a RPC quando o cliente não é visível na organização", async () => {
    let rpcCalls = 0;
    const supabase = {
      from: () => queryResult({ data: null, error: null }),
      rpc: async () => { rpcCalls++; return { data: null, error: null }; },
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { saveProposalAction } = await import("./actions.ts");
    const result = await saveProposalAction(null, { status: "idle", message: "" }, validProposalForm());
    assert.equal(result.status, "error");
    assert.equal(result.fieldErrors?.client_id, "Selecione outro cliente.");
    assert.equal(rpcCalls, 0);
  });

  it("salva a estrutura de opções pela RPC transacional", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const supabase = {
      from: () => queryResult({ data: { id: uuid("1") }, error: null }),
      rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: uuid("9"), error: null }; },
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { saveProposalOptionsAction } = await import("./actions.ts");

    await assert.rejects(() => saveProposalOptionsAction(null, { status: "idle", message: "" }, validOptionsForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/propostas/${uuid("9")}?success=proposal-created`);
    assert.equal(calls[0]?.[0], "save_proposal_options_draft");
    assert.equal((calls[0]?.[1].target_options as unknown[]).length, 2);
    assert.equal((calls[0]?.[1].target_common_items as unknown[]).length, 1);
  });

  it("seleciona opção por RPC e revalida a proposta", async () => {
    const calls: unknown[] = [];
    const supabase = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: uuid("4"), error: null }; } };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { selectProposalOptionAction } = await import("./actions.ts");
    const result = await selectProposalOptionAction(uuid("3"), uuid("4"), { status: "idle", message: "" });
    assert.equal(result.status, "success");
    assert.deepEqual(calls, [["select_proposal_option", { target_proposal_id: uuid("3"), target_option_id: uuid("4") }]]);
    assert.deepEqual(revalidated, ["/propostas", `/propostas/${uuid("3")}`]);
  });

  it("restringe a aprovação atômica a owner e admin", async () => {
    let rpcCalls = 0;
    const supabase = { rpc: async () => { rpcCalls++; return { data: uuid("3"), error: null }; } };
    const { approveProposalOptionAction } = await import("./actions.ts");
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const denied = await approveProposalOptionAction(uuid("3"), uuid("4"), { status: "idle", message: "" });
    assert.equal(denied.status, "error");
    assert.equal(rpcCalls, 0);

    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "admin" }, supabase };
    const approved = await approveProposalOptionAction(uuid("3"), uuid("4"), { status: "idle", message: "" });
    assert.equal(approved.status, "success");
    assert.equal(rpcCalls, 1);
  });

  it("bloqueia aprovação por member antes de chamar a RPC", async () => {
    let rpcCalls = 0;
    const supabase = {
      from: () => queryResult({ data: { id: uuid("3"), client_id: uuid("1"), status: "sent" }, error: null }),
      rpc: async () => { rpcCalls++; return { data: uuid("3"), error: null }; },
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { transitionProposalAction } = await import("./actions.ts");
    const result = await transitionProposalAction(uuid("3"), "approved", { status: "idle", message: "" }, new FormData());
    assert.equal(result.status, "error");
    assert.match(result.message, /owner e admin/);
    assert.equal(rpcCalls, 0);
  });

  it("permite aprovação por admin e exige motivo para rejeição", async () => {
    let rpcCalls = 0;
    const supabase = {
      from: () => queryResult({ data: { id: uuid("3"), client_id: uuid("1"), status: "sent" }, error: null }),
      rpc: async () => { rpcCalls++; return { data: uuid("3"), error: null }; },
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "admin" }, supabase };
    const { transitionProposalAction } = await import("./actions.ts");
    const approved = await transitionProposalAction(uuid("3"), "approved", { status: "idle", message: "" }, new FormData());
    assert.equal(approved.status, "success");
    assert.equal(rpcCalls, 1);

    const rejected = await transitionProposalAction(uuid("3"), "rejected", { status: "idle", message: "" }, new FormData());
    assert.equal(rejected.status, "error");
    assert.equal(rejected.fieldErrors?.rejection_reason, "O motivo é obrigatório.");
  });

  it("cria revisão por RPC e traduz duplicidade sem expor erro do banco", async () => {
    const supabase = { rpc: async () => ({ data: uuid("5"), error: null }) };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { createProposalRevisionAction } = await import("./actions.ts");
    await assert.rejects(() => createProposalRevisionAction(uuid("3"), { status: "idle", message: "" }, new FormData()),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/propostas/${uuid("5")}/editar`);

    currentContext = {
      status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" },
      supabase: { rpc: async () => ({ data: null, error: { code: "23505", message: "internal duplicate detail" } }) },
    };
    const duplicate = await createProposalRevisionAction(uuid("3"), { status: "idle", message: "" }, new FormData());
    assert.equal(duplicate.status, "error");
    assert.match(duplicate.message, /já existe/);
    assert.ok(!duplicate.message.includes("internal"));
  });
});
