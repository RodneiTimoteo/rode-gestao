import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getCrmMembers } from "@/features/crm/server/queries";
import { isUuid } from "@/features/crm/validation";
import { projectEventActorName } from "@/features/projects/presentation";
import type {
  ApprovedProposalChoice,
  ProjectDetails,
  ProjectEvent,
  ProjectFilters,
  ProjectIndicators,
  ProjectListItem,
  ProjectListResult,
  ProjectEventSubjectType,
  ProjectRecord,
  ProjectStageProgress,
  ProjectStageRecord,
  ProjectStagesResult,
  ProjectTaskRecord,
} from "@/features/projects/types";

const projectColumns = "id, organization_id, client_id, proposal_id, name, description, status, owner_user_id, start_date, original_expected_end_date, expected_end_date, completed_at, contracted_amount, proposal_snapshot, created_by, created_at, updated_at";
const projectStageColumns = "id, organization_id, project_id, name, description, position, status, responsible_user_id, planned_start_date, planned_end_date, started_at, completed_at, archived_at, created_at, updated_at";
const projectTaskColumns = "id, organization_id, project_id, project_stage_id, title, description, position, status, priority, assigned_to, due_date, completed_at, created_at, updated_at";

async function getAllProjectTasks(supabase: SupabaseClient, organizationId: string, projectId: string) {
  const tasks: ProjectTaskRecord[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("project_tasks")
      .select(projectTaskColumns)
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .order("project_stage_id", { ascending: true })
      .order("position", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = (data ?? []) as ProjectTaskRecord[];
    tasks.push(...page);
    if (page.length < pageSize) return { data: tasks, error: null };
  }
}

function safeSearch(value: string) {
  return value.replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function projectLookups(supabase: SupabaseClient, organizationId: string, projects: ProjectRecord[], currentUser?: User) {
  const clientIds = [...new Set(projects.map((project) => project.client_id))];
  const [clientsResult, members] = await Promise.all([
    clientIds.length
      ? supabase.from("clients").select("id, name").eq("organization_id", organizationId).in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    getCrmMembers(supabase, organizationId, currentUser),
  ]);
  if (clientsResult.error) throw new Error("Não foi possível carregar os clientes dos projetos.");
  return {
    clients: new Map((clientsResult.data ?? []).map((client) => [client.id, client.name])),
    members,
    memberNames: new Map(members.map((member) => [member.userId, member.displayName])),
  };
}

export async function getProjects(
  supabase: SupabaseClient,
  organizationId: string,
  filters: ProjectFilters,
  currentUser?: User,
): Promise<ProjectListResult> {
  const pageSize = 12;
  const from = (filters.page - 1) * pageSize;
  let query = supabase.from("projects").select(projectColumns, { count: "exact" }).eq("organization_id", organizationId);
  const search = safeSearch(filters.query);
  if (search) {
    const { data: clients, error } = await supabase.from("clients").select("id").eq("organization_id", organizationId).ilike("name", `%${search}%`).limit(100);
    if (error) throw new Error("Não foi possível pesquisar projetos.");
    const clientIds = (clients ?? []).map((client) => client.id);
    query = query.or(`name.ilike.%${search}%${clientIds.length ? `,client_id.in.(${clientIds.join(",")})` : ""}`);
  }
  if (filters.status !== "all") query = query.eq("status", filters.status);
  const { data, error, count } = await query.order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw new Error("Não foi possível carregar os projetos.");
  const records = (data ?? []) as ProjectRecord[];
  const lookups = await projectLookups(supabase, organizationId, records, currentUser);
  return {
    projects: records.map((project) => ({
      ...project,
      clientName: lookups.clients.get(project.client_id) ?? "Cliente indisponível",
      ownerName: project.owner_user_id ? lookups.memberNames.get(project.owner_user_id) ?? "Membro indisponível" : null,
    })) as ProjectListItem[],
    count: count ?? 0,
    page: filters.page,
    pageSize,
  };
}

export async function getProjectIndicators(supabase: SupabaseClient, organizationId: string): Promise<ProjectIndicators> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [totalResult, activeResult, attentionResult, overdueResult] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "in_progress"),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["paused", "awaiting_client"]),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).lt("expected_end_date", today).not("status", "in", "(completed,cancelled)"),
  ]);
  if (totalResult.error || activeResult.error || attentionResult.error || overdueResult.error) throw new Error("Não foi possível carregar os indicadores de projetos.");
  return { total: totalResult.count ?? 0, active: activeResult.count ?? 0, attention: attentionResult.count ?? 0, overdue: overdueResult.count ?? 0 };
}

export async function getProjectFormOptions(supabase: SupabaseClient, organizationId: string, currentUser: User) {
  const [clientsResult, members] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", organizationId).neq("status", "inactive").order("name"),
    getCrmMembers(supabase, organizationId, currentUser),
  ]);
  if (clientsResult.error) throw new Error("Não foi possível carregar as opções do projeto.");
  return { clients: clientsResult.data ?? [], members };
}

export async function getApprovedProposalChoices(supabase: SupabaseClient, organizationId: string): Promise<ApprovedProposalChoice[]> {
  const [proposalsResult, projectsResult] = await Promise.all([
    supabase.from("proposals").select("id, client_id, code, revision_number, title, proposal_format, selected_option_id, total_amount, notes").eq("organization_id", organizationId).eq("status", "approved").order("approved_at", { ascending: false }),
    supabase.from("projects").select("id, proposal_id").eq("organization_id", organizationId).not("proposal_id", "is", null),
  ]);
  if (proposalsResult.error || projectsResult.error) throw new Error("Não foi possível carregar as propostas aprovadas.");
  const proposals = proposalsResult.data ?? [];
  const clientIds = [...new Set(proposals.map((proposal) => proposal.client_id))];
  const optionIds = proposals.map((proposal) => proposal.selected_option_id).filter((id): id is string => Boolean(id));
  const [clientsResult, optionsResult] = await Promise.all([
    clientIds.length ? supabase.from("clients").select("id, name").eq("organization_id", organizationId).in("id", clientIds) : Promise.resolve({ data: [], error: null }),
    optionIds.length ? supabase.from("proposal_options").select("id, name").eq("organization_id", organizationId).in("id", optionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientsResult.error || optionsResult.error) throw new Error("Não foi possível carregar os vínculos das propostas.");
  const clientNames = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const optionNames = new Map((optionsResult.data ?? []).map((option) => [option.id, option.name]));
  const existingProjects = new Map((projectsResult.data ?? []).filter((project) => project.proposal_id).map((project) => [project.proposal_id as string, project.id]));
  return proposals.map((proposal) => ({
    ...proposal,
    proposal_format: proposal.proposal_format as "simple" | "options",
    clientName: clientNames.get(proposal.client_id) ?? "Cliente indisponível",
    selectedOptionName: proposal.selected_option_id ? optionNames.get(proposal.selected_option_id) ?? null : null,
    existingProjectId: existingProjects.get(proposal.id) ?? null,
  }));
}

export async function getProjectById(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string,
  currentUser: User,
): Promise<ProjectDetails | null> {
  const { data, error } = await supabase.from("projects").select(projectColumns).eq("organization_id", organizationId).eq("id", projectId).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o projeto.");
  if (!data) return null;
  const project = data as ProjectRecord;
  const [lookups, eventsResult, proposalResult] = await Promise.all([
    projectLookups(supabase, organizationId, [project], currentUser),
    supabase.from("project_events").select("id, event_type, actor_user_id, actor_name_snapshot, description, event_data, justification, subject_type, subject_id, occurred_at").eq("organization_id", organizationId).eq("project_id", projectId).order("occurred_at", { ascending: false }),
    project.proposal_id
      ? supabase.from("proposals").select("id, code, revision_number, title").eq("organization_id", organizationId).eq("id", project.proposal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (eventsResult.error || proposalResult.error) throw new Error("Não foi possível carregar os detalhes do projeto.");
  const actorNames = lookups.memberNames;
  return {
    ...project,
    clientName: lookups.clients.get(project.client_id) ?? "Cliente indisponível",
    ownerName: project.owner_user_id ? lookups.memberNames.get(project.owner_user_id) ?? "Membro indisponível" : null,
    proposal: proposalResult.data,
    events: (eventsResult.data ?? []).map((event) => ({
      ...event,
      event_type: event.event_type as ProjectEvent["event_type"],
      event_data: (event.event_data ?? {}) as Record<string, unknown>,
      actor_name_snapshot: event.actor_name_snapshot ?? null,
      actorName: projectEventActorName(event.actor_name_snapshot, actorNames.get(event.actor_user_id)),
      subject_type: (event.subject_type ?? "project") as ProjectEventSubjectType,
      subject_id: event.subject_id ?? projectId,
    })),
  };
}

export async function getProjectStages(
  supabase: SupabaseClient,
  organizationId: string,
  projectId: string,
): Promise<ProjectStagesResult> {
  if (!isUuid(projectId)) throw new Error("Projeto inválido.");

  const [stagesResult, tasksResult, stageProgressResult, projectProgressResult] = await Promise.all([
    supabase
      .from("project_stages")
      .select(projectStageColumns)
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("position", { ascending: true }),
    getAllProjectTasks(supabase, organizationId, projectId),
    supabase
      .from("project_stage_progress")
      .select("project_stage_id, eligible_tasks, completed_tasks, progress_percent")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId),
    supabase
      .from("project_progress")
      .select("eligible_tasks, completed_tasks, progress_percent")
      .eq("organization_id", organizationId)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (stagesResult.error || tasksResult.error || stageProgressResult.error || projectProgressResult.error) {
    throw new Error("Não foi possível carregar as etapas do projeto.");
  }

  return {
    stages: (stagesResult.data ?? []) as ProjectStageRecord[],
    tasks: (tasksResult.data ?? []) as ProjectTaskRecord[],
    stageProgress: (stageProgressResult.data ?? []) as ProjectStageProgress[],
    projectProgress: projectProgressResult.data ?? {
      eligible_tasks: 0,
      completed_tasks: 0,
      progress_percent: 0,
    },
  };
}
