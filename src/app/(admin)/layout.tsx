import { AdminShell } from "@/components/layout/admin-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.user_metadata?.display_name;
  const displayName = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : (user.email ?? "Usuário RODE");
  let organizationName = "Organização não definida";

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  const organizationIds = memberships?.map((membership) => membership.organization_id) ?? [];
  if (organizationIds.length) {
    const { data: organizations } = await supabase
      .from("organizations")
      .select("name, slug")
      .in("id", organizationIds)
      .eq("status", "active")
      .order("name");
    const activeOrganization = organizations?.find((organization) => organization.slug === "rode") ?? organizations?.[0];
    if (activeOrganization?.name) organizationName = activeOrganization.name;
  }

  return <AdminShell user={{ displayName, email: user.email ?? "" }} organizationName={organizationName}>{children}</AdminShell>;
}
