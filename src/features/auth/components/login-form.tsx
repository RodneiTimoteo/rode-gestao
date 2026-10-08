"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PasswordField } from "@/features/auth/components/password-field";
import { getFriendlyAuthError } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath, initialMessage, initialError }: { nextPath: string; initialMessage?: string; initialError?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
      });
      if (signInError) throw signInError;
      router.replace(nextPath);
      router.refresh();
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
      setLoading(false);
    }
  }

  return <form onSubmit={handleSubmit} className="space-y-5"><div><label htmlFor="email" className="mb-2 block text-sm font-medium text-strong">E-mail</label><div className="relative"><Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-subtle" /><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required autoFocus className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-strong outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand-soft" placeholder="voce@empresa.com.br" /></div></div><PasswordField /><div className="flex justify-end"><Link href="/recuperar-senha" className="text-sm font-medium text-brand hover:underline">Esqueci minha senha</Link></div>{initialMessage && !error && <p role="status" className="rounded-xl border border-positive/20 bg-positive-soft px-4 py-3 text-sm text-positive">{initialMessage}</p>}{error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}<button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-65">{loading ? <><span className="mr-2 size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />Entrando…</> : "Entrar"}</button><p className="text-center text-xs leading-5 text-subtle">Acesso exclusivo para usuários autorizados pela RODE.</p></form>;
}
