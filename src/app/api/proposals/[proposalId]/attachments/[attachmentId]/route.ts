import { NextResponse } from "next/server";
import { getCrmContext } from "@/features/crm/server/context";
import { isUuid } from "@/features/crm/validation";

export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string; attachmentId: string }> }) {
  const { proposalId, attachmentId } = await params;
  if (!isUuid(proposalId) || !isUuid(attachmentId)) return NextResponse.json({ message: "Documento inválido." }, { status: 400 });
  const context = await getCrmContext();
  if (context.status !== "ready") return NextResponse.json({ message: "Sessão inválida." }, { status: 401 });
  const { data: attachment, error } = await context.supabase.from("proposal_attachments").select("storage_bucket, storage_object_path, original_file_name").eq("organization_id", context.organization.id).eq("proposal_id", proposalId).eq("id", attachmentId).is("storage_deleted_at", null).maybeSingle();
  if (error || !attachment) return NextResponse.json({ message: "Documento não encontrado ou sem permissão." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data, error: signedError } = await context.supabase.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_object_path, 60, download ? { download: attachment.original_file_name } : undefined);
  if (signedError || !data?.signedUrl) return NextResponse.json({ message: "Não foi possível abrir o documento." }, { status: 502 });
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
