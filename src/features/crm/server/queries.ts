import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  ActivityView,
  ClientFilters,
  ClientListResult,
  ClientRecord,
  CrmMember,
  KanbanOpportunity,
  OpportunityRecord,
  PipelineStage,
} from "@/features/crm/types";

const clientColumns = "id, organization_id, kind, name, legal_name, tax_id, responsible_name, contact_name, email, phone, whatsapp, segment, city, state, country, source, notes, status, archived_at, assigned_to, created_by, created_at, updated_at";
const opportunityColumns = "id, organization_id, client_id, pipeline_stage_id, owner_user_id, title, service_interest, estimated_value, expected_close_date, outcome, opened_at, closed_at, lost_reason, notes, archived_at, created_by, created_at, updated_at";
const stageColumns = "id, organization_id, key, name, position, outcome, is_active";

function safeSearchTerm(value: string) {
  return value.replace(/[^\p{L}\p{N}\s@.+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function fallbackMemberName(userId: string) {
  return `Membro ${userId.slice(0, 6).toUpperCase()}`;
}

export async function getCrmMembers(
  supabase: SupabaseClient,
  organizationId: string,
  currentUser?: User,
): Promise<CrmMember[]> {
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at");

  if (error) throw new Error("Não foi possível carregar os membros da organização.");
  if (!memberships?.length) return [];

  const userIds = memberships.map((membership) => membership.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  return memberships.map((membership) => {
    const isCurrentUser = currentUser?.id === membership.user_id;
    const metadataName = isCurrentUser
      ? currentUser?.user_metadata?.full_name ?? currentUser?.user_metadata?.name ?? currentUser?.user_metadata?.display_name
      : null;
    const name = profileNames.get(membership.user_id) ?? metadataName;
    return {
      userId: membership.user_id,
      role: membership.role,
      displayName:
        typeof name === "string" && name.trim()
          ? name.trim()
          : isCurrentUser && currentUser?.email
            ? currentUser.email
            : fallbackMemberName(membership.user_id),
    } as CrmMember;
  });
}

export async function getClients(
  supabase: SupabaseClient,
  organizationId: string,
  filters: ClientFilters,
): Promise<ClientListResult> {
  const pageSize = 10;
  const from = (filters.page - 1) * pageSize;
  let query = supabase
    .from("clients")
    .select(clientColumns, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchTerm(filters.query);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,legal_name.ilike.%${search}%,contact_name.ilike.%${search}%,responsible_name.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.kind !== "all") query = query.eq("kind", filters.kind);

  if (filters.sort === "name") query = query.order("name", { ascending: true });
  else if (filters.sort === "oldest") query = query.order("created_at", { ascending: true });
  else query = query.order("updated_at", { ascending: false });

  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error("Não foi possível carregar os clientes.");

  return {
    clients: (data ?? []) as ClientRecord[],
    count: count ?? 0,
    page: filters.page,
    pageSize,
  };
}

export async function getClientById(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
) {
  const { data, error } = await supabase
    .from("clients")
    .select(clientColumns)
    .eq("organization_id", organizationId)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o cliente.");
  return data as ClientRecord | null;
}

export async function getPipelineStages(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select(stageColumns)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("position");
  if (error) throw new Error("Não foi possível carregar as etapas comerciais.");
  return (data ?? []) as PipelineStage[];
}

export async function getClientOpportunities(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
) {
  const { data, error } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as oportunidades.");
  return (data ?? []) as OpportunityRecord[];
}

export async function getOpportunityById(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
  opportunityId: string,
) {
  const { data, error } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar a oportunidade.");
  return data as OpportunityRecord | null;
}

export async function getKanbanOpportunities(
  supabase: SupabaseClient,
  organizationId: string,
  members: CrmMember[],
) {
  const { data, error } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar o funil comercial.");

  const opportunities = (data ?? []) as OpportunityRecord[];
  const clientIds = [...new Set(opportunities.map((opportunity) => opportunity.client_id))];
  const { data: clients, error: clientsError } = clientIds.length
    ? await supabase
        .from("clients")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", clientIds)
    : { data: [], error: null };
  if (clientsError) throw new Error("Não foi possível carregar os clientes do funil.");

  const clientNames = new Map((clients ?? []).map((client) => [client.id, client.name]));
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return opportunities.map((opportunity) => ({
    ...opportunity,
    clientName: clientNames.get(opportunity.client_id) ?? "Cliente indisponível",
    ownerName: opportunity.owner_user_id ? memberNames.get(opportunity.owner_user_id) ?? null : null,
  })) as KanbanOpportunity[];
}

export async function getClientActivities(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
  members: CrmMember[],
  opportunities: OpportunityRecord[],
) {
  const { data, error } = await supabase
    .from("client_activities")
    .select("id, organization_id, client_id, opportunity_id, activity_type, description, author_user_id, occurred_at, created_at")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar o histórico do cliente.");

  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  const opportunityTitles = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity.title]));
  return (data ?? []).map((activity) => ({
    ...activity,
    authorName: memberNames.get(activity.author_user_id) ?? fallbackMemberName(activity.author_user_id),
    opportunityTitle: activity.opportunity_id
      ? opportunityTitles.get(activity.opportunity_id) ?? "Oportunidade indisponível"
      : null,
  })) as ActivityView[];
}
