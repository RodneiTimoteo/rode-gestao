"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return <button type="button" onClick={logout} disabled={loading} title={compact ? "Sair" : undefined} className={`mt-2 flex h-10 w-full items-center rounded-xl text-xs font-medium text-muted hover:bg-soft hover:text-strong disabled:opacity-60 ${compact ? "justify-center" : "gap-3 px-3"}`}><Icon name="logout" className="size-[17px]" />{!compact && <span>{loading ? "Saindo…" : "Sair"}</span>}</button>;
}
