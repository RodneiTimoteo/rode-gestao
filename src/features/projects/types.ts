export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "paused"
  | "awaiting_client"
  | "completed"
  | "cancelled";

export type ProjectStageStatus = "pending" | "in_progress" | "completed" | "skipped";
export type ProjectStageReorderDirection = "up" | "down";
export type ProjectTaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type ProjectTaskPriority = "low" | "medium" | "high" | "urgent";

export type ProjectEventSubjectType = "project" | "stage" | "task" | "checklist_item";

export type ProjectEventType =
  | "created"
  | "created_from_proposal"
  | "status_changed"
  | "owner_changed"
  | "deadline_changed"
  | "completed"
  | "cancelled"
  | "stage_created"
  | "stage_updated"
  | "stage_reordered"
  | "stage_archived"
  | "task_created"
  | "task_updated"
  | "task_status_changed"
  | "task_completed"
  | "task_reopened"
  | "task_assignee_changed"
  | "task_deadline_changed"
  | "task_reordered";

export type ProjectActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

export const initialProjectActionState: ProjectActionState = { status: "idle", message: "" };

export type ProjectStageInput = {
  name: string;
  description: string | null;
  responsible_user_id: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
};

export type ProjectRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  proposal_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner_user_id: string | null;
  start_date: string | null;
  original_expected_end_date: string | null;
  expected_end_date: string | null;
  completed_at: string | null;
  contracted_amount: number | string | null;
  proposal_snapshot: ProjectProposalSnapshot | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProjectProposalSnapshot = {
  proposal_id?: string;
  code?: string;
  revision_group_id?: string;
  revision_number?: number;
  title?: string;
  proposal_format?: "simple" | "options";
  selected_option_id?: string | null;
  selected_option?: { id: string; name: string; description: string | null; total_amount: number | string } | null;
  items?: Array<{
    id: string;
    service_id: string | null;
    option_id: string | null;
    service_name: string;
    description: string;
    quantity: number | string;
    unit_price: number | string;
    discount_amount: number | string;
    line_total: number | string;
  }>;
};

export type ProjectListItem = ProjectRecord & {
  clientName: string;
  ownerName: string | null;
};

export type ProjectEvent = {
  id: string;
  event_type: ProjectEventType;
  actor_user_id: string;
  actor_name_snapshot: string | null;
  actorName: string;
  description: string;
  event_data: Record<string, unknown>;
  justification: string | null;
  subject_type: ProjectEventSubjectType;
  subject_id: string;
  occurred_at: string;
};

export type ProjectStageRecord = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  description: string | null;
  position: number;
  status: ProjectStageStatus;
  responsible_user_id: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectStageProgress = {
  project_stage_id: string;
  eligible_tasks: number;
  completed_tasks: number;
  progress_percent: number;
};

export type ProjectTaskRecord = {
  id: string;
  organization_id: string;
  project_id: string;
  project_stage_id: string;
  title: string;
  description: string | null;
  position: number;
  status: ProjectTaskStatus;
  priority: ProjectTaskPriority;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectProgress = {
  eligible_tasks: number;
  completed_tasks: number;
  progress_percent: number;
};

export type ProjectStagesResult = {
  stages: ProjectStageRecord[];
  tasks: ProjectTaskRecord[];
  stageProgress: ProjectStageProgress[];
  projectProgress: ProjectProgress;
};

export type ProjectDetails = ProjectListItem & {
  proposal: { id: string; code: string; revision_number: number; title: string } | null;
  events: ProjectEvent[];
};

export type ApprovedProposalChoice = {
  id: string;
  client_id: string;
  clientName: string;
  code: string;
  revision_number: number;
  title: string;
  proposal_format: "simple" | "options";
  selectedOptionName: string | null;
  total_amount: number | string | null;
  notes: string | null;
  existingProjectId: string | null;
};

export type ProjectFilters = {
  query: string;
  status: ProjectStatus | "all";
  page: number;
};

export type ProjectListResult = {
  projects: ProjectListItem[];
  count: number;
  page: number;
  pageSize: number;
};

export type ProjectIndicators = {
  total: number;
  active: number;
  attention: number;
  overdue: number;
};

export type ManualProjectInput = {
  client_id: string;
  name: string;
  description: string | null;
  owner_user_id: string | null;
  start_date: string | null;
  expected_end_date: string | null;
  contracted_amount: number | null;
};

export type ProposalProjectInput = Omit<ManualProjectInput, "client_id" | "contracted_amount"> & {
  proposal_id: string;
};
