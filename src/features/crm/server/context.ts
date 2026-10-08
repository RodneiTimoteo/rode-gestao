import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActiveOrganization, OrganizationRole } from "@/features/crm/types";

export class NoActiveOrganizationError extends Error {
  constructor() {
    super("Sua conta não possui uma organização ativa. Peça acesso ao administrador da RODE.");
    this.name = "NoActiveOrganizationError";
  }
}

export async function getCrmContext() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return { status: "unauthenticated" as const, supabase };
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", authData.user.id)
    .eq("status", "active");

  if (membershipsError) {
    throw new Error("Não foi possível validar o vínculo com a organização.");
  }
  if (!memberships?.length) {
    return { status: "no-organization" as const, supabase, user: authData.user };
  }

  const organizationIds = memberships.map((membership) => membership.organization_id);
  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, slug, status")
    .in("id", organizationIds)
    .eq("status", "active")
    .order("name");

  if (organizationsError) {
    throw new Error("Não foi possível validar a organização ativa.");
  }
  if (!organizations?.length) {
    return { status: "no-organization" as const, supabase, user: authData.user };
  }

  const organizationRow = organizations.find((organization) => organization.slug === "rode") ?? organizations[0];
  const membership = memberships.find((item) => item.organization_id === organizationRow.id);
  if (!membership) {
    return { status: "no-organization" as const, supabase, user: authData.user };
  }

  const organization: ActiveOrganization = {
    id: organizationRow.id,
    name: organizationRow.name,
    slug: organizationRow.slug,
    role: membership.role as OrganizationRole,
  };

  return {
    status: "ready" as const,
    supabase,
    user: authData.user,
    organization,
  };
}

export async function requireCrmContext() {
  const context = await getCrmContext();
  if (context.status === "unauthenticated") redirect("/login");
  if (context.status === "no-organization") throw new NoActiveOrganizationError();
  return context;
}
