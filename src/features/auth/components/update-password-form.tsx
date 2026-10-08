"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordField } from "@/features/auth/components/password-field";
import { getFriendlyAuthError } from "@/lib/auth/messages";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("passwordConfirmation") ?? "");
    if (password !== confirmation) {
      setError("As senhas informadas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/login?message=senha_atualizada");
      router.refresh();
    } catch (updateError) {
      setError(getFriendlyAuthError(updateError));
      setLoading(false);
    }
  }

  return <form onSubmit={handleSubmit} className="space-y-5"><PasswordField label="Nova senha" autoComplete="new-password" minLength={8} /><PasswordField id="passwordConfirmation" label="Confirme a nova senha" autoComplete="new-password" minLength={8} />{error && <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}<button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-65">{loading ? "Atualizando…" : "Definir nova senha"}</button><p className="text-xs leading-5 text-subtle">Use pelo menos 8 caracteres e evite senhas reutilizadas.</p></form>;
}
