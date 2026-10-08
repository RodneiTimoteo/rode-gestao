"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { getFriendlyAuthError } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/client";

export function RecoveryRequestForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const supabase = createClient();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
      });
      if (requestError) throw requestError;
      setSent(true);
    } catch (requestError) {
      setError(getFriendlyAuthError(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (sent) return <div><div className="grid size-12 place-items-center rounded-2xl bg-positive-soft text-positive"><Icon name="mail" className="size-5" /></div><h2 className="mt-5 text-lg font-semibold text-strong">Verifique seu e-mail</h2><p className="mt-2 text-sm leading-6 text-muted">Se existir uma conta associada ao endereço informado, você receberá um link para redefinir a senha.</p><Link href="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"><Icon name="arrowLeft" className="size-4" />Voltar para o login</Link></div>;

  return <form onSubmit={handleSubmit} className="space-y-5"><div><label htmlFor="email" className="mb-2 block text-sm font-medium text-strong">E-mail</label><div className="relative"><Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-subtle" /><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required autoFocus className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-strong outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="voce@empresa.com.br" /></div></div>{error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}<button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-65">{loading ? "Enviando…" : "Enviar link de recuperação"}</button><Link href="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-muted hover:text-brand"><Icon name="arrowLeft" className="size-4" />Voltar para o login</Link></form>;
}
