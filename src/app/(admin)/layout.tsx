import { AdminShell } from "@/components/layout/admin-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name;
  const displayName = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : (user.email ?? "Usuário RODE");

  return <AdminShell user={{ displayName, email: user.email ?? "" }}>{children}</AdminShell>;
}
