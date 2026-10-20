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

before(() => {
  mockModule(contextModule, { exports: { getCrmContext: async () => currentContext } });
  mockModule("next/cache", { exports: { revalidatePath: (path: string) => revalidated.push(path) } });
  mockModule("next/navigation", { exports: { redirect: (location: string) => { throw new RedirectSignal(location); } } });
});

beforeEach(() => { currentContext = undefined; revalidated.length = 0; });
after(() => mock.restoreAll());

function uuid(seed: string) { return `${seed.padStart(8, "0").slice(-8)}-0000-4000-8000-000000000000`; }

function validForm() {
  const data = new FormData();
  data.set("client_id", uuid("1"));
  data.set("name", "Projeto QA");
  data.set("owner_user_id", uuid("2"));
  data.set("start_date", "2026-10-20");
  data.set("expected_end_date", "2026-12-20");
  data.set("contracted_amount", "1.500,00");
  return data;
}

describe("Server Actions de projetos com Supabase mockado", () => {
  it("deriva a organização da sessão ao criar manualmente", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const supabase = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: uuid("9"), error: null }; } };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { createManualProjectAction } = await import("./actions.ts");
    const form = validForm();
    form.set("organization_id", uuid("6"));
    await assert.rejects(() => createManualProjectAction({ status: "idle", message: "" }, form),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/projetos/${uuid("9")}?success=project-created`);
    assert.equal(calls[0]?.[0], "create_manual_project");
    assert.equal(calls[0]?.[1].target_organization_id, uuid("8"));
    assert.equal(calls[0]?.[1].target_contracted_amount, 1500);
    assert.deepEqual(revalidated, ["/projetos"]);
  });

  it("redireciona para o projeto existente retornado pela RPC idempotente", async () => {
    const supabase = { rpc: async () => ({ data: { project_id: uuid("9"), created: false }, error: null }) };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { createProjectFromProposalAction } = await import("./actions.ts");
    await assert.rejects(() => createProjectFromProposalAction(uuid("3"), { status: "idle", message: "" }, validForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/projetos/${uuid("9")}?success=project-existing`);
    assert.deepEqual(revalidated, ["/projetos", `/propostas/${uuid("3")}`]);
  });

  it("bloqueia transição inválida antes da RPC", async () => {
    let rpcCalls = 0;
    const supabase = { rpc: async () => { rpcCalls++; return { data: null, error: null }; } };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { changeProjectStatusAction } = await import("./actions.ts");
    const result = await changeProjectStatusAction(uuid("9"), "paused", "completed", { status: "idle", message: "" }, new FormData());
    assert.equal(result.status, "error");
    assert.equal(rpcCalls, 0);
  });

  it("exige justificativa de pausa e de prazo antes da RPC", async () => {
    let rpcCalls = 0;
    const supabase = { rpc: async () => { rpcCalls++; return { data: null, error: null }; } };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { changeProjectDeadlineAction, changeProjectStatusAction } = await import("./actions.ts");
    const pause = await changeProjectStatusAction(uuid("9"), "in_progress", "paused", { status: "idle", message: "" }, new FormData());
    assert.equal(pause.fieldErrors?.justification, "Informe o motivo desta situação.");
    const deadline = new FormData();
    deadline.set("expected_end_date", "2027-01-20");
    const deadlineResult = await changeProjectDeadlineAction(uuid("9"), { status: "idle", message: "" }, deadline);
    assert.equal(deadlineResult.fieldErrors?.justification, "A justificativa é obrigatória.");
    assert.equal(rpcCalls, 0);
  });

  it("usa RPCs auditáveis para situação, responsável e prazo", async () => {
    const calls: string[] = [];
    const supabase = { rpc: async (name: string) => { calls.push(name); return { data: uuid("9"), error: null }; } };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase };
    const { assignProjectOwnerAction, changeProjectDeadlineAction, changeProjectStatusAction } = await import("./actions.ts");
    await changeProjectStatusAction(uuid("9"), "planning", "in_progress", { status: "idle", message: "" }, new FormData());
    const owner = new FormData(); owner.set("owner_user_id", uuid("2"));
    await assignProjectOwnerAction(uuid("9"), { status: "idle", message: "" }, owner);
    const deadline = new FormData(); deadline.set("expected_end_date", "2027-01-20"); deadline.set("justification", "Solicitação do cliente");
    await changeProjectDeadlineAction(uuid("9"), { status: "idle", message: "" }, deadline);
    assert.deepEqual(calls, ["change_project_status", "assign_project_owner", "change_project_deadline"]);
  });
});
