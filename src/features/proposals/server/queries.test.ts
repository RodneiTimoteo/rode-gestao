import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProposalById, getProposals } from "./queries.ts";

const clientId = "00000001-0000-4000-8000-000000000000";

function thenableQuery(result: unknown, methods: Record<string, (...args: unknown[]) => unknown> = {}) {
  const query: Record<string, unknown> = {
    then: (resolvePromise: (value: unknown) => void) => resolvePromise(result),
    ...methods,
  };
  for (const method of ["select", "eq", "in", "ilike", "limit", "order", "is", "maybeSingle"]) {
    if (!query[method]) query[method] = () => query;
  }
  return query;
}

describe("consultas de listagem com Supabase mockado", () => {
  it("sanitiza busca e aplica status, ordenação e paginação preservando o cliente", async () => {
    const proposalCalls: Array<[string, unknown[]]> = [];
    const proposal = {
      id: "00000002-0000-4000-8000-000000000000",
      organization_id: "00000003-0000-4000-8000-000000000000",
      client_id: clientId,
      code: "PROP-000002",
      title: "Teste funcional",
      status: "sent",
      total_amount: 300,
      created_at: "2026-10-09T12:00:00Z",
      updated_at: "2026-10-09T12:00:00Z",
    };
    const proposalQuery: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "order"]) {
      proposalQuery[method] = (...args: unknown[]) => { proposalCalls.push([method, args]); return proposalQuery; };
    }
    proposalQuery.range = (...args: unknown[]) => {
      proposalCalls.push(["range", args]);
      return Promise.resolve({ data: [proposal], error: null, count: 21 });
    };

    let clientQueryCount = 0;
    const supabase = {
      from: (table: string) => {
        if (table === "proposals") return proposalQuery;
        clientQueryCount++;
        if (clientQueryCount === 1) return thenableQuery({ data: [{ id: clientId }], error: null });
        return thenableQuery({ data: [{ id: clientId, name: "Cliente QA" }], error: null });
      },
    };

    const result = await getProposals(supabase as never, proposal.organization_id, {
      query: "Cliente);drop table--",
      status: "sent",
      sort: "created",
      page: 2,
    });

    assert.equal(result.count, 21);
    assert.equal(result.page, 2);
    assert.equal(result.proposals[0]?.clientName, "Cliente QA");
    assert.deepEqual(proposalCalls.find(([method]) => method === "range")?.[1], [10, 19]);
    assert.deepEqual(proposalCalls.find(([method, args]) => method === "order" && args[0] === "created_at")?.[1], ["created_at", { ascending: false }]);
    const orFilter = String(proposalCalls.find(([method]) => method === "or")?.[1][0]);
    assert.ok(orFilter.includes("code.ilike.%Cliente drop table--%"));
    assert.ok(orFilter.includes(`client_id.in.(${clientId})`));
    assert.ok(!orFilter.includes(");"));
  });

  it("agrupa itens comuns e exclusivos em suas opções", async () => {
    const proposalId = "00000002-0000-4000-8000-000000000000";
    const organizationId = "00000003-0000-4000-8000-000000000000";
    const optionA = "00000004-0000-4000-8000-000000000000";
    const optionB = "00000005-0000-4000-8000-000000000000";
    const proposal = { id: proposalId, organization_id: organizationId, client_id: clientId, opportunity_id: null, proposal_format: "options", selected_option_id: optionB };
    const rows: Record<string, unknown> = {
      proposals: { data: proposal, error: null },
      clients: { data: [{ id: clientId, name: "Cliente QA" }], error: null },
      proposal_items: { data: [
        { id: "common", proposal_id: proposalId, option_id: null, position: 1 },
        { id: "a", proposal_id: proposalId, option_id: optionA, position: 1 },
        { id: "b", proposal_id: proposalId, option_id: optionB, position: 1 },
      ], error: null },
      proposal_options: { data: [
        { id: optionA, proposal_id: proposalId, name: "Essencial", position: 1 },
        { id: optionB, proposal_id: proposalId, name: "Completa", position: 2 },
      ], error: null },
      proposal_events: { data: [], error: null },
      proposal_attachments: { data: [], error: null },
    };
    const supabase = { from: (table: string) => thenableQuery(rows[table]) };

    const result = await getProposalById(supabase as never, organizationId, proposalId);

    assert.equal(result?.items.length, 1);
    assert.deepEqual(result?.options.map((option) => [option.name, option.items.map((item) => item.id)]), [
      ["Essencial", ["a"]],
      ["Completa", ["b"]],
    ]);
    assert.equal(result?.selected_option_id, optionB);
  });
});
