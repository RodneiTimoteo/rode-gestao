import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";
import { canReplaceAttachment, MAX_PDF_SIZE, validatePdfFile } from "@/features/proposals/validation";

export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  if (!isUuid(proposalId)) return NextResponse.json({ message: "Proposta inválida." }, { status: 400 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_SIZE + 1024 * 1024) return NextResponse.json({ message: "O PDF deve ter no máximo 20 MB." }, { status: 413 });
  const context = await getCrmContext();
  if (context.status !== "ready") return NextResponse.json({ message: "Sessão inválida ou sem organização ativa." }, { status: 401 });
  const { data: proposal, error: proposalError } = await context.supabase.from("proposals").select("id").eq("organization_id", context.organization.id).eq("id", proposalId).maybeSingle();
  if (proposalError || !proposal) return NextResponse.json({ message: "Proposta não encontrada ou sem permissão." }, { status: 404 });

  const body = await request.formData();
  const file = body.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Selecione um PDF." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validationError = validatePdfFile(file, bytes);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });
  const supersedes = String(body.get("supersedes_attachment_id") ?? "");
  if (supersedes && !isUuid(supersedes)) return NextResponse.json({ message: "Versão anterior inválida." }, { status: 400 });
  if (supersedes) {
    const { data: previous } = await context.supabase.from("proposal_attachments").select("id, uploaded_by").eq("organization_id", context.organization.id).eq("proposal_id", proposalId).eq("id", supersedes).eq("is_current", true).is("storage_deleted_at", null).maybeSingle();
    if (!previous) return NextResponse.json({ message: "A versão selecionada não está disponível para substituição." }, { status: 409 });
    if (!canReplaceAttachment(context.organization.role, context.user.id, previous.uploaded_by)) return NextResponse.json({ message: "Você não pode substituir um documento enviado por outro membro." }, { status: 403 });
  }

  const attachmentId = randomUUID();
  const path = `${context.organization.id}/${proposalId}/${attachmentId}/document.pdf`;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const originalName = file.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 255) || "documento.pdf";
  const { error: metadataError } = await context.supabase.from("proposal_attachments").insert({
    id: attachmentId, organization_id: context.organization.id, proposal_id: proposalId,
    supersedes_attachment_id: supersedes || null, original_file_name: originalName,
    storage_object_path: path, mime_type: "application/pdf", size_bytes: file.size,
    checksum_sha256: checksum, uploaded_by: context.user.id,
  });
  if (metadataError) return NextResponse.json({ message: "Não foi possível reservar esta versão do documento." }, { status: 409 });

  const { error: uploadError } = await context.supabase.storage.from("proposal-documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    const { error: cleanupError } = await context.supabase.from("proposal_attachments").update({ is_current: false, storage_deleted_at: new Date().toISOString() }).eq("organization_id", context.organization.id).eq("id", attachmentId);
    const { error: restoreError } = supersedes
      ? await context.supabase.from("proposal_attachments").update({ is_current: true }).eq("organization_id", context.organization.id).eq("id", supersedes).is("storage_deleted_at", null)
      : { error: null };
    const compensated = !cleanupError && !restoreError;
    return NextResponse.json({ message: compensated ? "O upload falhou e os metadados foram compensados. Tente novamente." : "O upload falhou e a compensação não pôde ser confirmada. Atualize a página antes de tentar novamente." }, { status: 502 });
  }
  return NextResponse.json({ id: attachmentId }, { status: 201 });
}
