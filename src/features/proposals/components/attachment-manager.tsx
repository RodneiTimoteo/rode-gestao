"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatFileSize, formatProposalDate } from "@/features/proposals/format";
import type { ProposalAttachment } from "@/features/proposals/types";
import type { OrganizationRole } from "@/features/crm/types";
import { canReplaceAttachment, MAX_PDF_SIZE } from "@/features/proposals/validation";

export function AttachmentManager({ proposalId, attachments, authorNames, currentUserId, role }: { proposalId: string; attachments: ProposalAttachment[]; authorNames: Record<string, string>; currentUserId: string; role: OrganizationRole }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [replaceId, setReplaceId] = useState("");
  const upload = async () => {
    const file = input.current?.files?.[0];
    if (!file) { setMessage({ error: true, text: "Selecione um PDF." }); return; }
    if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") { setMessage({ error: true, text: "Selecione um arquivo PDF válido." }); return; }
    if (file.size <= 0 || file.size > MAX_PDF_SIZE) { setMessage({ error: true, text: "O PDF deve ter no máximo 20 MB." }); return; }
    setPending(true); setMessage(null);
    const data = new FormData(); data.set("file", file); if (replaceId) data.set("supersedes_attachment_id", replaceId);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/attachments`, { method: "POST", body: data });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Falha no upload.");
      setMessage({ error: false, text: replaceId ? "Nova versão salva com sucesso." : "Novo documento enviado com sucesso." }); setReplaceId(""); if (input.current) input.current.value = ""; router.refresh();
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : "Falha no upload. Tente novamente." }); }
    finally { setPending(false); }
  };
  const replaceable = attachments.filter((item) => item.is_current && canReplaceAttachment(role, currentUserId, item.uploaded_by));
  const groups = Array.from(attachments.reduce((map, attachment) => {
    const group = map.get(attachment.logical_file_id) ?? [];
    group.push(attachment);
    map.set(attachment.logical_file_id, group);
    return map;
  }, new Map<string, ProposalAttachment[]>()).values()).map((versions) => {
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    const currentVersion = sorted.find((item) => item.is_current) ?? sorted[0];
    return { current: currentVersion, history: sorted.filter((item) => item.id !== currentVersion.id) };
  });
  const documentLinks = (attachment: ProposalAttachment) => <div className="flex shrink-0 gap-3"><a href={`/api/proposals/${proposalId}/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand hover:underline">Abrir</a><a href={`/api/proposals/${proposalId}/attachments/${attachment.id}?download=1`} className="text-sm font-semibold text-brand hover:underline">Baixar</a></div>;
  return <div><div className="rounded-xl border border-dashed border-brand/35 bg-brand-soft/45 p-4"><p className="text-sm font-semibold text-strong">{replaceId ? "Substituir documento existente" : "Enviar novo documento"}</p><p className="mt-1 text-xs leading-5 text-muted">{replaceId ? "O arquivo anterior será preservado no histórico e este PDF será salvo como nova versão." : "Cria um novo documento lógico, independente dos arquivos já enviados."}</p><label className="mt-4 block text-sm font-medium text-strong" htmlFor="proposal_pdf">Arquivo PDF</label><input ref={input} id="proposal_pdf" type="file" accept="application/pdf,.pdf" className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand" /><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{replaceable.length > 0 && <select aria-label="Modo de envio ou documento a substituir" value={replaceId} onChange={(event) => setReplaceId(event.target.value)} className="h-10 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm text-strong"><option value="">Enviar como novo documento</option>{replaceable.map((item) => <option key={item.id} value={item.id}>Substituir: {item.original_file_name}</option>)}</select>}<button type="button" onClick={upload} disabled={pending} className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60">{pending ? "Enviando..." : message?.error ? "Tentar novamente" : replaceId ? "Salvar nova versão" : "Enviar novo documento"}</button></div><p className="mt-2 text-xs text-subtle">Máximo de 20 MB. Extensão, MIME e assinatura real serão validados.</p>{message && <p role={message.error ? "alert" : "status"} className={`mt-3 text-sm ${message.error ? "text-danger" : "text-positive"}`}>{message.text}</p>}</div>
    <div className="mt-4 space-y-3">{groups.length === 0 ? <p className="text-sm text-muted">Nenhum documento anexado.</p> : groups.map(({ current, history }) => <article key={current.logical_file_id} className="rounded-xl border border-line bg-surface p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-strong">{current.original_file_name}</p><span className="rounded-full bg-positive-soft px-2 py-0.5 text-[10px] font-semibold text-positive">Versão atual · v{current.version}</span></div><p className="mt-1 text-xs text-muted">{formatFileSize(current.size_bytes)} · {formatProposalDate(current.created_at, true)} · {authorNames[current.uploaded_by] ?? "Membro da organização"}</p></div>{documentLinks(current)}</div>{history.length > 0 && <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-xs font-semibold text-brand">Ver histórico de versões ({history.length})</summary><div className="mt-3 space-y-2">{history.map((attachment) => <div key={attachment.id} className="flex flex-col gap-2 rounded-lg bg-soft/65 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-strong">{attachment.original_file_name} <span className="text-xs text-subtle">· v{attachment.version}</span></p><p className="mt-1 text-xs text-muted">{formatFileSize(attachment.size_bytes)} · {formatProposalDate(attachment.created_at, true)} · {authorNames[attachment.uploaded_by] ?? "Membro da organização"}</p></div>{documentLinks(attachment)}</div>)}</div></details>}</article>)}</div>
  </div>;
}
