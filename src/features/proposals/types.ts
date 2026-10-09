import type { ActionState, OpportunityRecord, OrganizationRole } from "@/features/crm/types";

export type ProposalStatus = "draft" | "sent" | "negotiating" | "approved" | "rejected" | "expired" | "cancelled";
export type ProposalFormat = "simple" | "options";

export type ProposalRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  opportunity_id: string | null;
  proposal_number: number | string;
  code: string;
  revision_group_id: string;
  revision_number: number;
  supersedes_proposal_id: string | null;
  title: string;
  proposal_format: ProposalFormat;
  selected_option_id: string | null;
  status: ProposalStatus;
  valid_until: string | null;
  payment_terms: string | null;
  execution_deadline: string | null;
  notes: string | null;
  commercial_terms: string | null;
  rejection_reason: string | null;
  subtotal_amount: number | string | null;
  discount_amount: number | string | null;
  total_amount: number | string | null;
  sent_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProposalItem = {
  id: string;
  proposal_id: string;
  option_id: string | null;
  service_id: string | null;
  position: number;
  service_name_snapshot: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  line_total: number | string;
};

export type ProposalOptionRecord = {
  id: string;
  organization_id: string;
  proposal_id: string;
  name: string;
  description: string | null;
  position: number;
  subtotal_amount: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProposalOptionView = ProposalOptionRecord & { items: ProposalItem[] };

export type ProposalAttachment = {
  id: string;
  proposal_id: string;
  logical_file_id: string;
  version: number;
  supersedes_attachment_id: string | null;
  original_file_name: string;
  storage_object_path: string;
  mime_type: string;
  size_bytes: number | string;
  is_current: boolean;
  storage_deleted_at: string | null;
  uploaded_by: string;
  created_at: string;
};

export type ProposalEvent = {
  id: string;
  event_type: string;
  actor_user_id: string;
  description: string | null;
  event_data: Record<string, unknown>;
  occurred_at: string;
};

export type ProposalView = ProposalRecord & { clientName: string };
export type ProposalDetails = ProposalRecord & {
  clientName: string;
  opportunity: Pick<OpportunityRecord, "id" | "title"> | null;
  items: ProposalItem[];
  options: ProposalOptionView[];
  attachments: ProposalAttachment[];
  events: ProposalEvent[];
};

export type ProposalFilters = {
  query: string;
  status: ProposalStatus | "all";
  sort: "updated" | "created";
  page: number;
};

export type ProposalListResult = { proposals: ProposalView[]; count: number; page: number; pageSize: number };
export type ProposalIndicators = { total: number; active: number; approved: number; approvedValue: number };

export type ProposalClientOption = { id: string; name: string };
export type ProposalOpportunityOption = { id: string; client_id: string; title: string };
export type ServiceOption = { id: string; name: string; description: string | null; reference_price: number | string | null };

export type ProposalFormItem = {
  id?: string;
  service_id: string | null;
  service_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
};

export type ProposalOptionInput = {
  id?: string;
  name: string;
  description: string | null;
  items: ProposalFormItem[];
};

export type ProposalOptionsInput = Omit<ProposalInput, "items"> & {
  proposal_format: "options";
  common_items: ProposalFormItem[];
  options: ProposalOptionInput[];
};

export type ProposalOptionValueSummary = {
  minimum: number;
  maximum: number;
  selected: number | null;
};

export type ProposalInput = {
  client_id: string;
  opportunity_id: string | null;
  title: string;
  valid_until: string | null;
  payment_terms: string | null;
  execution_deadline: string | null;
  notes: string | null;
  commercial_terms: string | null;
  items: ProposalFormItem[];
};

export type ProposalActionState = ActionState & { proposalId?: string };
export type ProposalPermission = { role: OrganizationRole; canApprove: boolean };
