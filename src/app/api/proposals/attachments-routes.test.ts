import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { after, before, beforeEach, describe, it, mock } from "node:test";

const contextModule = pathToFileURL(resolve("src/features/crm/server/context.ts")).href;
const mockModule = mock.module.bind(mock) as unknown as (specifier: string, options: { exports: Record<string, unknown> }) => void;
let currentContext: unknown;

before(async () => {
  mockModule(contextModule, { exports: { getCrmContext: async () => currentContext } });
});
beforeEach(() => { currentContext = undefined; });
after(() => mock.restoreAll());

const proposalId = "00000001-0000-4000-8000-000000000000";
const attachmentId = "00000002-0000-4000-8000-000000000000";

function pdfFile(name = "qa.pdf", type = "application/pdf") {
  return new File(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"], name, { type });
}

function postRequest(file: File, supersedes?: string, headers?: HeadersInit) {
  const body = new FormData();
  body.set("file", file);
  if (supersedes) body.set("supersedes_attachment_id", supersedes);
  return new Request(`http://localhost/api/proposals/${proposalId}/attachments`, { method: "POST", body, headers });
}

function selectQuery(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => result,
  };
  return query;
}

describe("rotas de anexos com integrações mockadas", () => {
  it("rejeita payload declarado acima de 20 MB antes de autenticar", async () => {
    const { POST } = await import("./[proposalId]/attachments/route.ts");
    const response = await POST(postRequest(pdfFile(), undefined, { "content-length": String(22 * 1024 * 1024) }), { params: Promise.resolve({ proposalId }) });
    assert.equal(response.status, 413);
  });

  it("rejeita sessão ausente e conteúdo que não é PDF", async () => {
    const { POST } = await import("./[proposalId]/attachments/route.ts");
    currentContext = { status: "unauthenticated" };
    const unauthorized = await POST(postRequest(pdfFile()), { params: Promise.resolve({ proposalId }) });
    assert.equal(unauthorized.status, 401);

    currentContext = {
      status: "ready", user: { id: attachmentId }, organization: { id: proposalId, role: "member" },
      supabase: { from: () => selectQuery({ data: { id: proposalId }, error: null }) },
    };
    const invalid = await POST(postRequest(new File(["não é pdf"], "falso.pdf", { type: "application/pdf" })), { params: Promise.resolve({ proposalId }) });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).message, /assinatura PDF/);
  });

  it("bloqueia member ao substituir PDF enviado por outro usuário", async () => {
    const otherUser = "00000003-0000-4000-8000-000000000000";
    let table = "";
    currentContext = {
      status: "ready", user: { id: attachmentId }, organization: { id: proposalId, role: "member" },
      supabase: {
        from: (name: string) => {
          table = name;
          return selectQuery(table === "proposals" ? { data: { id: proposalId }, error: null } : { data: { id: attachmentId, uploaded_by: otherUser }, error: null });
        },
      },
    };
    const { POST } = await import("./[proposalId]/attachments/route.ts");
    const response = await POST(postRequest(pdfFile(), attachmentId), { params: Promise.resolve({ proposalId }) });
    assert.equal(response.status, 403);
  });

  it("compensa metadados quando o Storage falha", async () => {
    const updates: unknown[] = [];
    const insertQuery = { insert: async () => ({ error: null }) };
    const updateQuery = {
      update: (value: unknown) => { updates.push(value); return updateQuery; },
      eq: () => updateQuery,
      is: async () => ({ error: null }),
      then: (resolvePromise: (value: unknown) => void) => resolvePromise({ error: null }),
    };
    currentContext = {
      status: "ready", user: { id: attachmentId }, organization: { id: proposalId, role: "admin" },
      supabase: {
        from: (name: string) => name === "proposals" ? selectQuery({ data: { id: proposalId }, error: null }) : {
          ...insertQuery,
          update: updateQuery.update,
        },
        storage: { from: () => ({ upload: async () => ({ error: { message: "offline" } }) }) },
      },
    };
    const { POST } = await import("./[proposalId]/attachments/route.ts");
    const response = await POST(postRequest(pdfFile()), { params: Promise.resolve({ proposalId }) });
    assert.equal(response.status, 502);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], { is_current: false, storage_deleted_at: updates[0] && (updates[0] as { storage_deleted_at: string }).storage_deleted_at });
  });

  it("reserva metadados e envia o PDF para um caminho isolado", async () => {
    let inserted: Record<string, unknown> | undefined;
    let uploaded: { path: string; bytes: Uint8Array; options: unknown } | undefined;
    currentContext = {
      status: "ready", user: { id: attachmentId }, organization: { id: proposalId, role: "member" },
      supabase: {
        from: (name: string) => name === "proposals" ? selectQuery({ data: { id: proposalId }, error: null }) : ({
          insert: async (value: Record<string, unknown>) => { inserted = value; return { error: null }; },
        }),
        storage: { from: () => ({ upload: async (path: string, bytes: Uint8Array, options: unknown) => { uploaded = { path, bytes, options }; return { error: null }; } }) },
      },
    };
    const { POST } = await import("./[proposalId]/attachments/route.ts");
    const response = await POST(postRequest(pdfFile("arquivo QA.pdf")), { params: Promise.resolve({ proposalId }) });
    assert.equal(response.status, 201);
    const result = await response.json() as { id: string };
    assert.match(result.id, /^[0-9a-f-]{36}$/);
    assert.equal(inserted?.organization_id, proposalId);
    assert.equal(inserted?.uploaded_by, attachmentId);
    assert.equal(inserted?.original_file_name, "arquivo QA.pdf");
    assert.equal(uploaded?.path, `${proposalId}/${proposalId}/${result.id}/document.pdf`);
    assert.equal(uploaded?.bytes.length, pdfFile().size);
  });

  it("gera URL privada somente para documento da organização autenticada", async () => {
    currentContext = {
      status: "ready", user: { id: attachmentId }, organization: { id: proposalId, role: "member" },
      supabase: {
        from: () => selectQuery({ data: { storage_bucket: "proposal-documents", storage_object_path: `${proposalId}/${proposalId}/${attachmentId}/document.pdf`, original_file_name: "qa.pdf" }, error: null }),
        storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/private" }, error: null }) }) },
      },
    };
    const { GET } = await import("./[proposalId]/attachments/[attachmentId]/route.ts");
    const response = await GET(new Request(`http://localhost/api/proposals/${proposalId}/attachments/${attachmentId}?download=1`), { params: Promise.resolve({ proposalId, attachmentId }) });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://example.test/private");
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  });
});
