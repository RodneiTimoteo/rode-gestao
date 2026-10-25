import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectStages } from "./queries.ts";

type QueryResult = { data: unknown; error: { message: string } | null };
type Operation = { table: string; method: string; args: unknown[] };

function supabaseStub(results: Record<string, QueryResult>) {
  const operations: Operation[] = [];
  const supabase = {
    from(table: string) {
      const record = (method: string, args: unknown[]) => operations.push({ table, method, args });
      const query = {
        select(...args: unknown[]) { record("select", args); return query; },
        eq(...args: unknown[]) { record("eq", args); return query; },
        is(...args: unknown[]) { record("is", args); return query; },
        order(...args: unknown[]) { record("order", args); return query; },
        range(...args: unknown[]) { record("range", args); return Promise.resolve(results[table]); },
        maybeSingle() { record("maybeSingle", []); return Promise.resolve(results[table]); },
        then(resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(results[table]).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { supabase, operations };
}

const organizationId = "23000000-0000-4000-8000-000000000001";
const projectId = "93000000-0000-4000-8000-000000000001";

test("carrega etapas ativas em ordem e progresso no escopo da organização", async () => {
  const stageId = "a1000000-0000-4000-8000-000000000001";
  const { supabase, operations } = supabaseStub({
    project_stages: { data: [{ id: stageId, position: 1, name: "Descoberta" }], error: null },
    project_tasks: { data: [
      { id: "b1000000-0000-4000-8000-000000000002", project_stage_id: stageId, position: 2, title: "Validar" },
      { id: "b1000000-0000-4000-8000-000000000001", project_stage_id: stageId, position: 1, title: "Mapear" },
    ], error: null },
    project_stage_progress: { data: [{ project_stage_id: stageId, eligible_tasks: 2, completed_tasks: 1, progress_percent: 50 }], error: null },
    project_progress: { data: { eligible_tasks: 2, completed_tasks: 1, progress_percent: 50 }, error: null },
  });

  const result = await getProjectStages(supabase, organizationId, projectId);

  assert.equal(result.stages[0]?.id, stageId);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.stageProgress[0]?.progress_percent, 50);
  assert.equal(result.projectProgress.completed_tasks, 1);
  assert.ok(operations.some((operation) => operation.table === "project_stages" && operation.method === "eq" && operation.args[0] === "organization_id" && operation.args[1] === organizationId));
  assert.ok(operations.some((operation) => operation.table === "project_stages" && operation.method === "eq" && operation.args[0] === "project_id" && operation.args[1] === projectId));
  assert.ok(operations.some((operation) => operation.table === "project_stages" && operation.method === "is" && operation.args[0] === "archived_at" && operation.args[1] === null));
  assert.ok(operations.some((operation) => operation.table === "project_stages" && operation.method === "order" && operation.args[0] === "position"));
  assert.ok(operations.some((operation) => operation.table === "project_tasks" && operation.method === "eq" && operation.args[0] === "organization_id" && operation.args[1] === organizationId));
  assert.ok(operations.some((operation) => operation.table === "project_tasks" && operation.method === "eq" && operation.args[0] === "project_id" && operation.args[1] === projectId));
  assert.deepEqual(
    operations.filter((operation) => operation.table === "project_tasks" && operation.method === "order").map((operation) => operation.args[0]),
    ["project_stage_id", "position"],
  );
  assert.ok(operations.some((operation) => operation.table === "project_tasks" && operation.method === "range" && operation.args[0] === 0 && operation.args[1] === 499));
});

test("mantém projeto sem etapas com progresso zerado", async () => {
  const { supabase } = supabaseStub({
    project_stages: { data: [], error: null },
    project_tasks: { data: [], error: null },
    project_stage_progress: { data: [], error: null },
    project_progress: { data: null, error: null },
  });

  const result = await getProjectStages(supabase, organizationId, projectId);
  assert.deepEqual(result.stages, []);
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(result.stageProgress, []);
  assert.deepEqual(result.projectProgress, { eligible_tasks: 0, completed_tasks: 0, progress_percent: 0 });
});

test("rejeita projeto inválido antes de consultar o Supabase", async () => {
  const { supabase, operations } = supabaseStub({});
  await assert.rejects(() => getProjectStages(supabase, organizationId, "projeto-inválido"), /Projeto inválido/);
  assert.equal(operations.length, 0);
});

test("não expõe detalhes internos quando uma leitura falha", async () => {
  const { supabase } = supabaseStub({
    project_stages: { data: null, error: { message: "internal relation detail" } },
    project_tasks: { data: [], error: null },
    project_stage_progress: { data: [], error: null },
    project_progress: { data: null, error: null },
  });

  await assert.rejects(
    () => getProjectStages(supabase, organizationId, projectId),
    (error: unknown) => error instanceof Error && error.message === "Não foi possível carregar as etapas do projeto.",
  );
});

test("trata falha na leitura de tarefas sem expor detalhes internos", async () => {
  const { supabase } = supabaseStub({
    project_stages: { data: [], error: null },
    project_tasks: { data: null, error: { message: "private task relation detail" } },
    project_stage_progress: { data: [], error: null },
    project_progress: { data: null, error: null },
  });

  await assert.rejects(
    () => getProjectStages(supabase, organizationId, projectId),
    (error: unknown) => error instanceof Error
      && error.message === "Não foi possível carregar as etapas do projeto."
      && !error.message.includes("private"),
  );
});
