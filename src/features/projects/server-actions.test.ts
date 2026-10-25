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

function validStageForm() {
  const data = new FormData();
  data.set("name", "Descoberta");
  data.set("description", "Levantamento inicial");
  data.set("responsible_user_id", uuid("2"));
  data.set("planned_start_date", "2026-10-25");
  data.set("planned_end_date", "2026-10-31");
  return data;
}

function validStageUpdateForm() {
  const data = validStageForm();
  data.set("expected_updated_at", "2026-10-25T12:00:00.000Z");
  return data;
}

function validTaskForm() {
  const data = new FormData();
  data.set("title", "Preparar diagnóstico");
  data.set("description", "Consolidar os dados coletados.");
  data.set("priority", "medium");
  data.set("assigned_to", uuid("2"));
  data.set("due_date", "2026-11-05");
  return data;
}

function archiveStageForm() {
  const data = new FormData();
  data.set("confirmation", "archive-project-stage");
  return data;
}

function stageSupabase(options: {
  project?: { id: string; status: string } | null;
  member?: { user_id: string } | null;
  stage?: {
    id: string;
    status: string;
    archived_at: string | null;
    updated_at: string;
    name?: string;
    description?: string | null;
    responsible_user_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
  } | null;
  rpcError?: { code: string; message: string } | null;
  pendingTask?: { id: string } | null;
  stageList?: Array<{ id: string }>;
  rpcData?: string | null;
} = {}) {
  const fromCalls: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const project = options.project === undefined ? { id: uuid("9"), status: "planning" } : options.project;
  const member = options.member === undefined ? { user_id: uuid("2") } : options.member;
  const stage = options.stage === undefined
    ? {
        id: uuid("4"),
        status: "in_progress",
        archived_at: null,
        updated_at: "2026-10-25T12:00:00.000Z",
        name: "Descoberta",
        description: "Levantamento inicial",
        responsible_user_id: uuid("2"),
        planned_start_date: "2026-10-25",
        planned_end_date: "2026-10-31",
      }
    : options.stage;
  const pendingTask = options.pendingTask === undefined ? null : options.pendingTask;
  const stageList = options.stageList ?? [{ id: uuid("3") }, { id: uuid("4") }, { id: uuid("5") }];
  return {
    fromCalls,
    rpcCalls,
    client: {
      from(table: string) {
        const call = { table, filters: {} as Record<string, unknown> };
        fromCalls.push(call);
        const query = {
          select() { return query; },
          eq(column: string, value: unknown) { call.filters[column] = value; return query; },
          is(column: string, value: unknown) { call.filters[column] = value; return query; },
          order(column: string, config: { ascending?: boolean } = {}) { call.filters[`order:${column}`] = config.ascending === false ? "desc" : "asc"; return query; },
          async range(from: number, to: number) { call.filters.range = [from, to]; return { data: stageList.slice(from, to + 1), error: null }; },
          not(column: string, operator: string, value: unknown) { call.filters[`not:${column}`] = `${operator}:${String(value)}`; return query; },
          limit(value: number) { call.filters.limit = value; return query; },
          async maybeSingle() {
            if (table === "projects") return { data: project, error: null };
            if (table === "organization_members") return { data: member, error: null };
            if (table === "project_stages") return { data: stage, error: null };
            if (table === "project_tasks") return { data: pendingTask, error: null };
            return { data: null, error: null };
          },
        };
        return query;
      },
      async rpc(name: string, args: Record<string, unknown>): Promise<{ data: string | null; error: { code: string; message: string } | null }> {
        rpcCalls.push([name, args]);
        return { data: options.rpcData === undefined ? uuid("4") : options.rpcData, error: options.rpcError ?? null };
      },
    },
  };
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

  it("cria uma etapa pela RPC com projeto e responsável validados na organização ativa", async () => {
    const supabase = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectStageAction } = await import("./actions.ts");
    const form = validStageForm();
    form.set("organization_id", uuid("6"));
    const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, form);

    assert.deepEqual(result, { status: "success", message: "Etapa criada com sucesso." });
    assert.deepEqual(supabase.rpcCalls, [["create_project_stage", {
      target_project_id: uuid("9"),
      target_name: "Descoberta",
      target_description: "Levantamento inicial",
      target_responsible_user_id: uuid("2"),
      target_planned_start_date: "2026-10-25",
      target_planned_end_date: "2026-10-31",
    }]]);
    assert.deepEqual(supabase.fromCalls, [
      { table: "projects", filters: { organization_id: uuid("8"), id: uuid("9") } },
      { table: "organization_members", filters: { organization_id: uuid("8"), user_id: uuid("2"), status: "active" } },
    ]);
    assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
  });

  it("rejeita projeto de outra organização antes de chamar a RPC", async () => {
    const supabase = stageSupabase({ project: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectStageAction } = await import("./actions.ts");
    const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm());
    assert.equal(result.status, "error");
    assert.match(result.message, /não encontrado/);
    assert.equal(supabase.rpcCalls.length, 0);
  });

  it("rejeita projeto encerrado antes de chamar a RPC", async () => {
    const { createProjectStageAction } = await import("./actions.ts");
    for (const status of ["completed", "cancelled"]) {
      const supabase = stageSupabase({ project: { id: uuid("9"), status } });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm());
      assert.equal(result.status, "error");
      assert.match(result.message, /concluídos ou cancelados/);
      assert.equal(supabase.rpcCalls.length, 0);
    }
  });

  it("rejeita responsável que não seja membro ativo da organização", async () => {
    const supabase = stageSupabase({ member: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectStageAction } = await import("./actions.ts");
    const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm());
    assert.equal(result.fieldErrors?.responsible_user_id, "Responsável inválido ou inativo.");
    assert.equal(supabase.rpcCalls.length, 0);
  });

  it("exige autenticação antes de processar a criação da etapa", async () => {
    currentContext = { status: "unauthenticated", supabase: {} };
    const { createProjectStageAction } = await import("./actions.ts");
    await assert.rejects(
      () => createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );
    assert.deepEqual(revalidated, []);
  });

  it("não expõe o erro da RPC nem revalida quando a criação falha", async () => {
    const supabase = stageSupabase({ rpcError: { code: "XX000", message: "internal secret detail" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectStageAction } = await import("./actions.ts");
    const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm());
    assert.deepEqual(result, { status: "error", message: "Não foi possível concluir a operação agora. Tente novamente." });
    assert.equal(result.message.includes("secret"), false);
    assert.deepEqual(revalidated, []);
    assert.deepEqual(supabase.rpcCalls.map(([name]) => name), ["create_project_stage"]);
  });

  it("não aceita sucesso sem um identificador de etapa válido", async () => {
    const supabase = stageSupabase();
    supabase.client.rpc = async (name: string, args: Record<string, unknown>) => {
      supabase.rpcCalls.push([name, args]);
      return { data: null, error: null };
    };
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectStageAction } = await import("./actions.ts");
    const result = await createProjectStageAction(uuid("9"), { status: "idle", message: "" }, validStageForm());
    assert.deepEqual(result, { status: "error", message: "O banco não retornou uma etapa válida." });
    assert.deepEqual(revalidated, []);
  });

  it("edita a etapa pela RPC preservando o status lido no servidor e delegando o histórico ao banco", async () => {
    const supabase = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { updateProjectStageAction } = await import("./actions.ts");
    const form = validStageUpdateForm();
    form.set("name", "Descoberta revisada");
    form.set("status", "completed");
    form.set("organization_id", uuid("6"));
    const result = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);

    assert.deepEqual(result, { status: "success", message: "Etapa atualizada com sucesso." });
    assert.deepEqual(supabase.rpcCalls, [["update_project_stage", {
      target_stage_id: uuid("4"),
      target_name: "Descoberta revisada",
      target_description: "Levantamento inicial",
      target_status: "in_progress",
      target_responsible_user_id: uuid("2"),
      target_planned_start_date: "2026-10-25",
      target_planned_end_date: "2026-10-31",
    }]]);
    assert.deepEqual(supabase.fromCalls, [
      { table: "projects", filters: { organization_id: uuid("8"), id: uuid("9") } },
      { table: "organization_members", filters: { organization_id: uuid("8"), user_id: uuid("2"), status: "active" } },
      { table: "project_stages", filters: { organization_id: uuid("8"), project_id: uuid("9"), id: uuid("4") } },
    ]);
    assert.equal(supabase.fromCalls.some((call) => call.table === "project_events"), false);
    assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
  });

  it("permite remover o responsável sem consultar um vínculo vazio", async () => {
    const supabase = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { updateProjectStageAction } = await import("./actions.ts");
    const form = validStageUpdateForm();
    form.set("responsible_user_id", "");
    const result = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);
    assert.equal(result.status, "success");
    assert.equal(supabase.rpcCalls[0]?.[1].target_responsible_user_id, null);
    assert.deepEqual(supabase.fromCalls.map((call) => call.table), ["projects", "project_stages"]);
  });

  it("rejeita nome e datas inválidos antes de consultar ou escrever", async () => {
    const supabase = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { updateProjectStageAction } = await import("./actions.ts");
    const form = validStageUpdateForm();
    form.set("name", "   ");
    form.set("planned_start_date", "2026-11-02");
    form.set("planned_end_date", "2026-11-01");
    const result = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);
    assert.deepEqual(Object.keys(result.fieldErrors ?? {}).sort(), ["name", "planned_end_date"]);
    assert.deepEqual(supabase.fromCalls, []);
    assert.deepEqual(supabase.rpcCalls, []);
  });

  it("rejeita etapa inexistente ou fora da organização e do projeto informados", async () => {
    const supabase = stageSupabase({ stage: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { updateProjectStageAction } = await import("./actions.ts");
    const result = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.match(result.message, /não encontrada/);
    assert.deepEqual(supabase.fromCalls.at(-1), {
      table: "project_stages",
      filters: { organization_id: uuid("8"), project_id: uuid("9"), id: uuid("4") },
    });
    assert.deepEqual(supabase.rpcCalls, []);
  });

  it("rejeita etapa arquivada e versão desatualizada", async () => {
    const { updateProjectStageAction } = await import("./actions.ts");
    const archived = stageSupabase({ stage: { id: uuid("4"), status: "pending", archived_at: "2026-10-25T13:00:00.000Z", updated_at: "2026-10-25T13:00:00.000Z" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: archived.client };
    const archivedResult = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.match(archivedResult.message, /arquivadas/);
    assert.deepEqual(archived.rpcCalls, []);

    const changed = stageSupabase({ stage: { id: uuid("4"), status: "pending", archived_at: null, updated_at: "2026-10-25T13:00:00.000Z" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: changed.client };
    const changedResult = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.match(changedResult.message, /alterada por outra operação/);
    assert.deepEqual(changed.rpcCalls, []);
  });

  it("rejeita responsável externo e projeto encerrado antes da RPC", async () => {
    const { updateProjectStageAction } = await import("./actions.ts");
    const externalMember = stageSupabase({ member: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: externalMember.client };
    const memberResult = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.equal(memberResult.fieldErrors?.responsible_user_id, "Responsável inválido ou inativo.");
    assert.deepEqual(externalMember.rpcCalls, []);

    const terminal = stageSupabase({ project: { id: uuid("9"), status: "completed" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: terminal.client };
    const terminalResult = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.match(terminalResult.message, /concluídos ou cancelados/);
    assert.deepEqual(terminal.rpcCalls, []);
  });

  it("exige autenticação para editar e sanitiza falhas da RPC", async () => {
    const { updateProjectStageAction } = await import("./actions.ts");
    currentContext = { status: "unauthenticated", supabase: {} };
    await assert.rejects(
      () => updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );

    const failed = stageSupabase({ rpcError: { code: "XX000", message: "secret database context" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: failed.client };
    const failedResult = await updateProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validStageUpdateForm());
    assert.deepEqual(failedResult, { status: "error", message: "Não foi possível concluir a operação agora. Tente novamente." });
    assert.equal(failedResult.message.includes("secret"), false);
    assert.deepEqual(revalidated, []);
  });

  it("executa todas as transições válidas preservando os demais campos lidos no servidor", async () => {
    const { changeProjectStageStatusAction } = await import("./actions.ts");
    const transitions = [
      ["pending", "in_progress"],
      ["pending", "skipped"],
      ["in_progress", "pending"],
      ["in_progress", "completed"],
      ["in_progress", "skipped"],
      ["completed", "in_progress"],
      ["skipped", "pending"],
    ] as const;

    for (const [currentStatus, nextStatus] of transitions) {
      const supabase = stageSupabase({ stage: {
        id: uuid("4"), status: currentStatus, archived_at: null, updated_at: "2026-10-25T12:00:00.000Z",
        name: "Execução", description: "Dados atuais", responsible_user_id: uuid("2"),
        planned_start_date: "2026-10-25", planned_end_date: "2026-11-30",
      } });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await changeProjectStageStatusAction(uuid("9"), uuid("4"), nextStatus, { status: "idle", message: "" }, new FormData());
      assert.equal(result.status, "success");
      assert.deepEqual(supabase.rpcCalls, [["update_project_stage", {
        target_stage_id: uuid("4"),
        target_name: "Execução",
        target_description: "Dados atuais",
        target_status: nextStatus,
        target_responsible_user_id: uuid("2"),
        target_planned_start_date: "2026-10-25",
        target_planned_end_date: "2026-11-30",
      }]]);
      assert.equal(supabase.fromCalls.some((call) => call.table === "project_events"), false);
      assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
      revalidated.length = 0;
    }
  });

  it("rejeita transição inválida, status nulo e status desconhecido", async () => {
    const { changeProjectStageStatusAction } = await import("./actions.ts");
    const invalidTransition = stageSupabase({ stage: {
      id: uuid("4"), status: "pending", archived_at: null, updated_at: "2026-10-25T12:00:00.000Z",
      name: "Etapa", description: null, responsible_user_id: null, planned_start_date: null, planned_end_date: null,
    } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: invalidTransition.client };
    const invalidResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "completed", { status: "idle", message: "" }, new FormData());
    assert.match(invalidResult.message, /não é permitida/);
    assert.deepEqual(invalidTransition.rpcCalls, []);

    for (const invalidStatus of [null, "unknown"]) {
      const supabase = stageSupabase();
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await changeProjectStageStatusAction(uuid("9"), uuid("4"), invalidStatus as never, { status: "idle", message: "" }, new FormData());
      assert.match(result.message, /situação válida/);
      assert.deepEqual(supabase.fromCalls, []);
      assert.deepEqual(supabase.rpcCalls, []);
    }

    const invalidCurrent = stageSupabase({ stage: {
      id: uuid("4"), status: "unknown", archived_at: null, updated_at: "2026-10-25T12:00:00.000Z",
      name: "Etapa", description: null, responsible_user_id: null, planned_start_date: null, planned_end_date: null,
    } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: invalidCurrent.client };
    const invalidCurrentResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "pending", { status: "idle", message: "" }, new FormData());
    assert.match(invalidCurrentResult.message, /possui uma situação inválida/);
    assert.deepEqual(invalidCurrent.rpcCalls, []);
  });

  it("bloqueia etapa arquivada, etapa externa e projeto encerrado", async () => {
    const { changeProjectStageStatusAction } = await import("./actions.ts");
    const archived = stageSupabase({ stage: { id: uuid("4"), status: "pending", archived_at: "2026-10-25T13:00:00.000Z", updated_at: "2026-10-25T13:00:00.000Z" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: archived.client };
    const archivedResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "in_progress", { status: "idle", message: "" }, new FormData());
    assert.match(archivedResult.message, /arquivadas/);
    assert.deepEqual(archived.rpcCalls, []);

    const external = stageSupabase({ stage: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: external.client };
    const externalResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "pending", { status: "idle", message: "" }, new FormData());
    assert.match(externalResult.message, /não encontrada/);
    assert.deepEqual(external.rpcCalls, []);

    const terminal = stageSupabase({ project: { id: uuid("9"), status: "cancelled" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: terminal.client };
    const terminalResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "pending", { status: "idle", message: "" }, new FormData());
    assert.match(terminalResult.message, /concluídos ou cancelados/);
    assert.deepEqual(terminal.rpcCalls, []);
  });

  it("exige autenticação e não expõe falhas da RPC de situação da etapa", async () => {
    const { changeProjectStageStatusAction } = await import("./actions.ts");
    currentContext = { status: "unauthenticated", supabase: {} };
    await assert.rejects(
      () => changeProjectStageStatusAction(uuid("9"), uuid("4"), "completed", { status: "idle", message: "" }, new FormData()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );

    const failed = stageSupabase({ rpcError: { code: "XX000", message: "private database detail" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: failed.client };
    const failedResult = await changeProjectStageStatusAction(uuid("9"), uuid("4"), "completed", { status: "idle", message: "" }, new FormData());
    assert.equal(failedResult.message, "Não foi possível concluir a operação agora. Tente novamente.");
    assert.equal(failedResult.message.includes("private"), false);
    assert.deepEqual(revalidated, []);
  });

  it("arquiva etapa sem tarefas após confirmação e registra o histórico somente pela RPC", async () => {
    const supabase = stageSupabase({ pendingTask: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { archiveProjectStageAction } = await import("./actions.ts");
    await assert.rejects(
      () => archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === `/projetos/${uuid("9")}?success=project-stage-archived`,
    );
    assert.deepEqual(supabase.rpcCalls, [["archive_project_stage", { target_stage_id: uuid("4") }]]);
    assert.equal(supabase.fromCalls.some((call) => call.table === "project_events"), false);
    assert.deepEqual(supabase.fromCalls.at(-1), {
      table: "project_tasks",
      filters: {
        organization_id: uuid("8"), project_id: uuid("9"), project_stage_id: uuid("4"),
        "not:status": "in:(done,cancelled)", limit: 1,
      },
    });
    assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
  });

  it("permite arquivar quando todas as tarefas estão concluídas ou canceladas", async () => {
    const supabase = stageSupabase({ pendingTask: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { archiveProjectStageAction } = await import("./actions.ts");
    await assert.rejects(
      () => archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm()),
      (error: unknown) => error instanceof RedirectSignal,
    );
    assert.deepEqual(supabase.rpcCalls.map(([name]) => name), ["archive_project_stage"]);
  });

  it("exige confirmação explícita e bloqueia tarefas pendentes", async () => {
    const { archiveProjectStageAction } = await import("./actions.ts");
    const unconfirmed = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: unconfirmed.client };
    const unconfirmedResult = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, new FormData());
    assert.match(unconfirmedResult.message, /Confirme explicitamente/);
    assert.deepEqual(unconfirmed.fromCalls, []);
    assert.deepEqual(unconfirmed.rpcCalls, []);

    const pending = stageSupabase({ pendingTask: { id: uuid("5") } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: pending.client };
    const pendingResult = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm());
    assert.match(pendingResult.message, /Conclua ou cancele/);
    assert.deepEqual(pending.rpcCalls, []);
  });

  it("rejeita etapa já arquivada ou fora da organização", async () => {
    const { archiveProjectStageAction } = await import("./actions.ts");
    const archived = stageSupabase({ stage: { id: uuid("4"), status: "completed", archived_at: "2026-10-25T15:00:00.000Z", updated_at: "2026-10-25T15:00:00.000Z" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: archived.client };
    const archivedResult = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm());
    assert.match(archivedResult.message, /já está arquivada/);
    assert.deepEqual(archived.rpcCalls, []);

    const external = stageSupabase({ stage: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: external.client };
    const externalResult = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm());
    assert.match(externalResult.message, /não encontrada/);
    assert.deepEqual(external.rpcCalls, []);
  });

  it("bloqueia arquivamento em projetos concluídos e cancelados", async () => {
    const { archiveProjectStageAction } = await import("./actions.ts");
    for (const status of ["completed", "cancelled"]) {
      const supabase = stageSupabase({ project: { id: uuid("9"), status } });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm());
      assert.match(result.message, /concluídos ou cancelados/);
      assert.deepEqual(supabase.rpcCalls, []);
    }
  });

  it("exige autenticação e sanitiza erros da RPC de arquivamento", async () => {
    const { archiveProjectStageAction } = await import("./actions.ts");
    currentContext = { status: "unauthenticated", supabase: {} };
    await assert.rejects(
      () => archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );

    const failed = stageSupabase({ rpcError: { code: "XX000", message: "private archive detail" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: failed.client };
    const failedResult = await archiveProjectStageAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, archiveStageForm());
    assert.equal(failedResult.message, "Não foi possível concluir a operação agora. Tente novamente.");
    assert.equal(failedResult.message.includes("private"), false);
    assert.deepEqual(revalidated, []);
  });

  it("move a primeira etapa para baixo usando a ordem completa lida no servidor", async () => {
    const supabase = stageSupabase({ rpcData: uuid("9") });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { reorderProjectStagesAction } = await import("./actions.ts");
    const result = await reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData());
    assert.deepEqual(result, { status: "success", message: "Ordem das etapas atualizada com sucesso." });
    assert.deepEqual(supabase.rpcCalls, [["reorder_project_stages", {
      target_project_id: uuid("9"), ordered_stage_ids: [uuid("4"), uuid("3"), uuid("5")],
    }]]);
    assert.deepEqual(supabase.fromCalls.at(-1), {
      table: "project_stages",
      filters: { organization_id: uuid("8"), project_id: uuid("9"), archived_at: null, "order:position": "asc", range: [0, 499] },
    });
    assert.equal(supabase.fromCalls.some((call) => call.table === "project_events"), false);
    assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
  });

  it("move a última etapa para cima", async () => {
    const supabase = stageSupabase({ rpcData: uuid("9") });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { reorderProjectStagesAction } = await import("./actions.ts");
    const result = await reorderProjectStagesAction(uuid("9"), uuid("5"), "up", { status: "idle", message: "" }, new FormData());
    assert.equal(result.status, "success");
    assert.deepEqual(supabase.rpcCalls[0]?.[1].ordered_stage_ids, [uuid("3"), uuid("5"), uuid("4")]);
  });

  it("impede ultrapassar os limites e reordenar uma lista unitária", async () => {
    const { reorderProjectStagesAction } = await import("./actions.ts");
    for (const [stageId, direction, expected] of [
      [uuid("3"), "up", /primeira etapa/],
      [uuid("5"), "down", /última etapa/],
    ] as const) {
      const supabase = stageSupabase();
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await reorderProjectStagesAction(uuid("9"), stageId, direction, { status: "idle", message: "" }, new FormData());
      assert.match(result.message, expected);
      assert.deepEqual(supabase.rpcCalls, []);
    }
    const single = stageSupabase({ stageList: [{ id: uuid("3") }] });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: single.client };
    const result = await reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData());
    assert.match(result.message, /única etapa/);
    assert.deepEqual(single.rpcCalls, []);
  });

  it("rejeita lista vazia e etapa inexistente ou arquivada", async () => {
    const { reorderProjectStagesAction } = await import("./actions.ts");
    for (const stageList of [[], [{ id: uuid("3") }, { id: uuid("5") }]]) {
      const supabase = stageSupabase({ stageList });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await reorderProjectStagesAction(uuid("9"), uuid("4"), "up", { status: "idle", message: "" }, new FormData());
      assert.match(result.message, /não encontrada na lista ativa/);
      assert.deepEqual(supabase.rpcCalls, []);
    }
  });

  it("rejeita identificadores e direção inválidos antes de consultar o banco", async () => {
    const { reorderProjectStagesAction } = await import("./actions.ts");
    for (const [projectId, stageId, direction, expected] of [
      ["invalid", uuid("3"), "up", /Projeto inválido/],
      [uuid("9"), "invalid", "up", /Etapa inválida/],
      [uuid("9"), uuid("3"), "sideways", /Direção de reordenação inválida/],
    ] as const) {
      const supabase = stageSupabase();
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await reorderProjectStagesAction(projectId, stageId, direction as never, { status: "idle", message: "" }, new FormData());
      assert.match(result.message, expected);
      assert.deepEqual(supabase.fromCalls, []);
      assert.deepEqual(supabase.rpcCalls, []);
    }
  });

  it("bloqueia projeto de outra organização e projetos encerrados", async () => {
    const { reorderProjectStagesAction } = await import("./actions.ts");
    const external = stageSupabase({ project: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: external.client };
    const externalResult = await reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData());
    assert.match(externalResult.message, /não encontrado nesta organização/);
    assert.deepEqual(external.rpcCalls, []);
    for (const status of ["completed", "cancelled"]) {
      const terminal = stageSupabase({ project: { id: uuid("9"), status } });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: terminal.client };
      const result = await reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData());
      assert.match(result.message, /concluídos ou cancelados/);
      assert.deepEqual(terminal.rpcCalls, []);
    }
  });

  it("exige autenticação, sanitiza falha da RPC e valida seu retorno", async () => {
    const { reorderProjectStagesAction } = await import("./actions.ts");
    currentContext = { status: "unauthenticated", supabase: {} };
    await assert.rejects(
      () => reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );
    for (const options of [
      { rpcError: { code: "XX000", message: "private reorder detail" }, rpcData: uuid("9") },
      { rpcError: null, rpcData: uuid("4") },
    ]) {
      const failed = stageSupabase(options);
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: failed.client };
      const result = await reorderProjectStagesAction(uuid("9"), uuid("3"), "down", { status: "idle", message: "" }, new FormData());
      assert.equal(result.status, "error");
      assert.equal(result.message.includes("private"), false);
      assert.deepEqual(revalidated, []);
    }
  });

  it("cria tarefa pela RPC após validar projeto, etapa e responsável na organização", async () => {
    const supabase = stageSupabase({ rpcData: uuid("6") });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectTaskAction } = await import("./actions.ts");
    const form = validTaskForm();
    form.set("organization_id", uuid("1"));
    const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);

    assert.deepEqual(result, { status: "success", message: "Tarefa criada com sucesso." });
    assert.deepEqual(supabase.rpcCalls, [["create_project_task", {
      target_stage_id: uuid("4"),
      target_title: "Preparar diagnóstico",
      target_description: "Consolidar os dados coletados.",
      target_priority: "medium",
      target_assigned_to: uuid("2"),
      target_due_date: "2026-11-05",
    }]]);
    assert.deepEqual(supabase.fromCalls, [
      { table: "projects", filters: { organization_id: uuid("8"), id: uuid("9") } },
      { table: "project_stages", filters: { organization_id: uuid("8"), project_id: uuid("9"), id: uuid("4") } },
      { table: "organization_members", filters: { organization_id: uuid("8"), user_id: uuid("2"), status: "active" } },
    ]);
    assert.equal(supabase.fromCalls.some((call) => call.table === "project_events"), false);
    assert.deepEqual(revalidated, ["/projetos", `/projetos/${uuid("9")}`]);
  });

  it("cria tarefa sem campos opcionais e mantém a prioridade média enviada pelo formulário", async () => {
    const supabase = stageSupabase({ rpcData: uuid("6") });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectTaskAction } = await import("./actions.ts");
    const form = validTaskForm();
    form.set("description", "");
    form.set("assigned_to", "");
    form.set("due_date", "");
    const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);
    assert.equal(result.status, "success");
    assert.deepEqual(supabase.rpcCalls[0]?.[1], {
      target_stage_id: uuid("4"), target_title: "Preparar diagnóstico", target_description: null,
      target_priority: "medium", target_assigned_to: null, target_due_date: null,
    });
    assert.equal(supabase.fromCalls.some((call) => call.table === "organization_members"), false);
  });

  it("rejeita dados inválidos da tarefa antes de consultar ou escrever", async () => {
    const supabase = stageSupabase();
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectTaskAction } = await import("./actions.ts");
    const form = validTaskForm();
    form.set("title", " ");
    form.set("description", "D".repeat(8001));
    form.set("priority", "critical");
    form.set("assigned_to", "invalid");
    form.set("due_date", "2026-02-31");
    const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, form);
    assert.deepEqual(Object.keys(result.fieldErrors ?? {}).sort(), ["assigned_to", "description", "due_date", "priority", "title"]);
    assert.deepEqual(supabase.fromCalls, []);
    assert.deepEqual(supabase.rpcCalls, []);
  });

  it("rejeita projeto ou etapa com identificador inválido", async () => {
    const { createProjectTaskAction } = await import("./actions.ts");
    for (const [projectId, stageId, expected] of [["invalid", uuid("4"), /Projeto inválido/], [uuid("9"), "invalid", /Etapa inválida/]] as const) {
      const supabase = stageSupabase();
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
      const result = await createProjectTaskAction(projectId, stageId, { status: "idle", message: "" }, validTaskForm());
      assert.match(result.message, expected);
      assert.deepEqual(supabase.fromCalls, []);
      assert.deepEqual(supabase.rpcCalls, []);
    }
  });

  it("bloqueia etapa inexistente, externa ou arquivada", async () => {
    const { createProjectTaskAction } = await import("./actions.ts");
    const missing = stageSupabase({ stage: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: missing.client };
    const missingResult = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
    assert.match(missingResult.message, /não encontrada/);
    assert.deepEqual(missing.fromCalls.at(-1), { table: "project_stages", filters: { organization_id: uuid("8"), project_id: uuid("9"), id: uuid("4") } });
    assert.deepEqual(missing.rpcCalls, []);

    const archived = stageSupabase({ stage: { id: uuid("4"), status: "completed", archived_at: "2026-10-25T15:00:00Z", updated_at: "2026-10-25T15:00:00Z" } });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: archived.client };
    const archivedResult = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
    assert.match(archivedResult.message, /arquivadas/);
    assert.deepEqual(archived.rpcCalls, []);
  });

  it("bloqueia projeto externo, concluído ou cancelado", async () => {
    const { createProjectTaskAction } = await import("./actions.ts");
    const external = stageSupabase({ project: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: external.client };
    const externalResult = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
    assert.match(externalResult.message, /não encontrado nesta organização/);
    assert.deepEqual(external.rpcCalls, []);

    for (const status of ["completed", "cancelled"]) {
      const terminal = stageSupabase({ project: { id: uuid("9"), status } });
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: terminal.client };
      const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
      assert.match(result.message, /concluídos ou cancelados/);
      assert.deepEqual(terminal.rpcCalls, []);
    }
  });

  it("rejeita responsável inativo ou externo", async () => {
    const supabase = stageSupabase({ member: null });
    currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: supabase.client };
    const { createProjectTaskAction } = await import("./actions.ts");
    const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
    assert.equal(result.fieldErrors?.assigned_to, "Responsável inválido ou inativo.");
    assert.deepEqual(supabase.rpcCalls, []);
  });

  it("exige autenticação, sanitiza falha da RPC e rejeita retorno inválido", async () => {
    const { createProjectTaskAction } = await import("./actions.ts");
    currentContext = { status: "unauthenticated", supabase: {} };
    await assert.rejects(
      () => createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm()),
      (error: unknown) => error instanceof RedirectSignal && error.location === "/login",
    );

    for (const options of [
      { rpcError: { code: "XX000", message: "private task detail" }, rpcData: uuid("6") },
      { rpcError: null, rpcData: "invalid" },
    ]) {
      const failed = stageSupabase(options);
      currentContext = { status: "ready", user: { id: uuid("7") }, organization: { id: uuid("8"), role: "member" }, supabase: failed.client };
      const result = await createProjectTaskAction(uuid("9"), uuid("4"), { status: "idle", message: "" }, validTaskForm());
      assert.equal(result.status, "error");
      assert.equal(result.message.includes("private"), false);
      assert.deepEqual(revalidated, []);
    }
  });
});
