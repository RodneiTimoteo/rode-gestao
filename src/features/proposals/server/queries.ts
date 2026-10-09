import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProposalAttachment,
  ProposalClientOption,
  ProposalDetails,
  ProposalEvent,
  ProposalFilters,
  ProposalIndicators,
  ProposalItem,
  ProposalListResult,
  ProposalOpportunityOption,
  ProposalOptionRecord,
  ProposalRecord,
  ProposalView,
  ServiceOption,
} from "@/features/proposals/types";

const proposalColumns = "id, organization_id, client_id, opportunity_id, proposal_number, code, revision_group_id, revision_number, supersedes_proposal_id, title, proposal_format, selected_option_id, status, valid_until, payment_terms, execution_deadline, notes, commercial_terms, rejection_reason, subtotal_amount, discount_amount, total_amount, sent_at, approved_at, approved_by, rejected_at, cancelled_at, created_by, created_at, updated_at";

function safeSearch(value: string) { return value.replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80); }

async function clientNames(supabase: SupabaseClient, organizationId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data, error } = await supabase.from("clients").select("id, name").eq("organization_id", organizationId).in("id", [...new Set(ids)]);
  if (error) throw new Error("Não foi possível carregar os clientes das propostas.");
  return new Map((data ?? []).map((client) => [client.id, client.name]));
}

export async function getProposals(supabase: SupabaseClient, organizationId: string, filters: ProposalFilters): Promise<ProposalListResult> {
  const pageSize = 10;
  const from = (filters.page - 1) * pageSize;
  let query = supabase.from("proposals").select(proposalColumns, { count: "exact" }).eq("organization_id", organizationId);
  const search = safeSearch(filters.query);
  if (search) {
    const { data: clients, error } = await supabase.from("clients").select("id").eq("organization_id", organizationId).ilike("name", `%${search}%`).limit(100);
    if (error) throw new Error("Não foi possível pesquisar propostas.");
    const clientIds = (clients ?? []).map((client) => client.id);
    query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%${clientIds.length ? `,client_id.in.(${clientIds.join(",")})` : ""}`);
  }
  if (filters.status !== "all") query = query.eq("status", filters.status);
  query = query.order(filters.sort === "created" ? "created_at" : "updated_at", { ascending: false });
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error("Não foi possível carregar as propostas.");
  const records = (data ?? []) as ProposalRecord[];
  const names = await clientNames(supabase, organizationId, records.map((record) => record.client_id));
  return { proposals: records.map((record) => ({ ...record, clientName: names.get(record.client_id) ?? "Cliente indisponível" })) as ProposalView[], count: count ?? 0, page: filters.page, pageSize };
}

export async function getProposalIndicators(supabase: SupabaseClient, organizationId: string): Promise<ProposalIndicators> {
  const [{ count: total, error: totalError }, { count: active, error: activeError }, approvedResult] = await Promise.all([
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("proposals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["sent", "negotiating"]),
    supabase.from("proposals").select("total_amount").eq("organization_id", organizationId).eq("status", "approved"),
  ]);
  if (totalError || activeError || approvedResult.error) throw new Error("Não foi possível carregar os indicadores de propostas.");
  const approved = approvedResult.data ?? [];
  return { total: total ?? 0, active: active ?? 0, approved: approved.length, approvedValue: approved.reduce((sum, row) => sum + Number(row.total_amount), 0) };
}

export async function getProposalFormOptions(supabase: SupabaseClient, organizationId: string) {
  const [clientsResult, opportunitiesResult, servicesResult] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", organizationId).neq("status", "inactive").order("name"),
    supabase.from("opportunities").select("id, client_id, title").eq("organization_id", organizationId).is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("services").select("id, name, description, reference_price").eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);
  if (clientsResult.error || opportunitiesResult.error || servicesResult.error) throw new Error("Não foi possível carregar as opções do formulário.");
  return { clients: (clientsResult.data ?? []) as ProposalClientOption[], opportunities: (opportunitiesResult.data ?? []) as ProposalOpportunityOption[], services: (servicesResult.data ?? []) as ServiceOption[] };
}

export async function getProposalById(supabase: SupabaseClient, organizationId: string, proposalId: string): Promise<ProposalDetails | null> {
  const { data, error } = await supabase.from("proposals").select(proposalColumns).eq("organization_id", organizationId).eq("id", proposalId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar a proposta.");
  if (!data) return null;
  const proposal = data as ProposalRecord;
  const [names, itemsResult, optionsResult, eventsResult, attachmentsResult, opportunityResult] = await Promise.all([
    clientNames(supabase, organizationId, [proposal.client_id]),
    supabase.from("proposal_items").select("id, proposal_id, option_id, service_id, position, service_name_snapshot, description, quantity, unit_price, discount_amount, line_total").eq("organization_id", organizationId).eq("proposal_id", proposalId).order("position"),
    supabase.from("proposal_options").select("id, organization_id, proposal_id, name, description, position, subtotal_amount, discount_amount, total_amount, created_by, created_at, updated_at").eq("organization_id", organizationId).eq("proposal_id", proposalId).order("position"),
    supabase.from("proposal_events").select("id, event_type, actor_user_id, description, event_data, occurred_at").eq("organization_id", organizationId).eq("proposal_id", proposalId).order("occurred_at", { ascending: false }),
    supabase.from("proposal_attachments").select("id, proposal_id, logical_file_id, version, supersedes_attachment_id, original_file_name, storage_object_path, mime_type, size_bytes, is_current, storage_deleted_at, uploaded_by, created_at").eq("organization_id", organizationId).eq("proposal_id", proposalId).is("storage_deleted_at", null).order("created_at", { ascending: false }),
    proposal.opportunity_id ? supabase.from("opportunities").select("id, title").eq("organization_id", organizationId).eq("id", proposal.opportunity_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (itemsResult.error || optionsResult.error || eventsResult.error || attachmentsResult.error || opportunityResult.error) throw new Error("Não foi possível carregar os detalhes da proposta.");
  const allItems = (itemsResult.data ?? []) as ProposalItem[];
  const optionRecords = (optionsResult.data ?? []) as ProposalOptionRecord[];
  return {
    ...proposal,
    clientName: names.get(proposal.client_id) ?? "Cliente indisponível",
    opportunity: opportunityResult.data,
    items: allItems.filter((item) => item.option_id === null),
    options: optionRecords.map((option) => ({ ...option, items: allItems.filter((item) => item.option_id === option.id) })),
    events: (eventsResult.data ?? []) as ProposalEvent[],
    attachments: (attachmentsResult.data ?? []) as ProposalAttachment[],
  };
}

export async function getClientProposals(supabase: SupabaseClient, organizationId: string, clientId: string) {
  const { data, error } = await supabase.from("proposals").select(proposalColumns).eq("organization_id", organizationId).eq("client_id", clientId).order("updated_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as propostas do cliente.");
  return (data ?? []) as ProposalRecord[];
}
