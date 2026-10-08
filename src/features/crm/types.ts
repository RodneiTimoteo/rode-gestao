export type OrganizationRole = "owner" | "admin" | "member";
export type ClientKind = "company" | "person";
export type ClientStatus = "lead" | "active" | "inactive";
export type OpportunityOutcome = "open" | "won" | "lost";
export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "proposal"
  | "message"
  | "other";

export type ActiveOrganization = {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
};

export type CrmMember = {
  userId: string;
  displayName: string;
  role: OrganizationRole;
};

export type ClientRecord = {
  id: string;
  organization_id: string;
  kind: ClientKind;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  responsible_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  country: string;
  source: string | null;
  notes: string | null;
  status: ClientStatus;
  archived_at: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PipelineStage = {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  position: number;
  outcome: OpportunityOutcome;
  is_active: boolean;
};

export type OpportunityRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  pipeline_stage_id: string;
  owner_user_id: string | null;
  title: string;
  service_interest: string | null;
  estimated_value: number | string | null;
  expected_close_date: string | null;
  outcome: OpportunityOutcome;
  opened_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ClientActivity = {
  id: string;
  organization_id: string;
  client_id: string;
  opportunity_id: string | null;
  activity_type: ActivityType;
  description: string;
  author_user_id: string;
  occurred_at: string;
  created_at: string;
};

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle", message: "" };

export type ClientFilters = {
  query: string;
  status: ClientStatus | "all";
  kind: ClientKind | "all";
  sort: "recent" | "name" | "oldest";
  page: number;
};

export type ClientListResult = {
  clients: ClientRecord[];
  count: number;
  page: number;
  pageSize: number;
};

export type KanbanOpportunity = OpportunityRecord & {
  clientName: string;
  ownerName: string | null;
};

export type ActivityView = ClientActivity & {
  authorName: string;
  opportunityTitle: string | null;
};
