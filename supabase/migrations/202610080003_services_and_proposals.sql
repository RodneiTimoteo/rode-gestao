begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table private.organization_document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, document_type),
  constraint organization_document_counters_type_valid
    check (document_type in ('proposal')),
  constraint organization_document_counters_value_nonnegative
    check (last_value >= 0)
);

revoke all on table private.organization_document_counters from public, anon, authenticated;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  billing_type text not null default 'fixed',
  reference_price numeric(14,2),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_org_id_unique unique (organization_id, id),
  constraint services_name_not_blank check (length(btrim(name)) > 0),
  constraint services_billing_type_valid check (
    billing_type in ('fixed', 'hourly', 'daily', 'monthly', 'custom')
  ),
  constraint services_reference_price_nonnegative check (
    reference_price is null or reference_price >= 0
  ),
  constraint services_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index services_org_name_unique
  on public.services (organization_id, lower(name));
create index services_org_active_category_idx
  on public.services (organization_id, is_active, category, name);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  opportunity_id uuid,
  proposal_number bigint not null,
  code text not null,
  revision_group_id uuid not null default gen_random_uuid(),
  revision_number integer not null default 1,
  supersedes_proposal_id uuid,
  title text not null,
  status text not null default 'draft',
  valid_until date,
  payment_terms text,
  execution_deadline text,
  notes text,
  commercial_terms text,
  rejection_reason text,
  subtotal_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  sent_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_org_id_unique unique (organization_id, id),
  constraint proposals_org_id_client_unique unique (organization_id, id, client_id),
  constraint proposals_org_number_unique unique (organization_id, proposal_number),
  constraint proposals_org_code_unique unique (organization_id, code),
  constraint proposals_revision_unique unique (organization_id, revision_group_id, revision_number),
  constraint proposals_supersedes_unique unique (organization_id, supersedes_proposal_id),
  constraint proposals_title_not_blank check (length(btrim(title)) > 0),
  constraint proposals_number_positive check (proposal_number > 0),
  constraint proposals_revision_positive check (revision_number > 0),
  constraint proposals_status_valid check (
    status in ('draft', 'sent', 'negotiating', 'approved', 'rejected', 'expired', 'cancelled')
  ),
  constraint proposals_amounts_nonnegative check (
    subtotal_amount >= 0 and discount_amount >= 0 and total_amount >= 0
  ),
  constraint proposals_totals_consistent check (
    total_amount = subtotal_amount - discount_amount
  ),
  constraint proposals_approval_state_valid check (
    (status = 'approved' and approved_at is not null and approved_by is not null)
    or (status <> 'approved' and approved_at is null and approved_by is null)
  ),
  constraint proposals_rejection_state_valid check (
    (status = 'rejected' and rejected_at is not null and rejection_reason is not null
      and length(btrim(rejection_reason)) > 0)
    or (status <> 'rejected' and rejected_at is null and rejection_reason is null)
  ),
  constraint proposals_cancellation_state_valid check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint proposals_client_same_org_fk foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint proposals_opportunity_client_same_org_fk
    foreign key (organization_id, opportunity_id, client_id)
    references public.opportunities (organization_id, id, client_id) on delete restrict,
  constraint proposals_supersedes_same_org_fk foreign key (organization_id, supersedes_proposal_id)
    references public.proposals (organization_id, id) on delete restrict,
  constraint proposals_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint proposals_approver_member_fk foreign key (organization_id, approved_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index proposals_org_status_updated_idx
  on public.proposals (organization_id, status, updated_at desc);
create index proposals_org_client_idx
  on public.proposals (organization_id, client_id, created_at desc);
create index proposals_org_opportunity_idx
  on public.proposals (organization_id, opportunity_id)
  where opportunity_id is not null;

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null,
  service_id uuid,
  position integer not null,
  service_name_snapshot text not null,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  line_total numeric(16,2) generated always as (
    round((quantity * unit_price) - discount_amount, 2)
  ) stored,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_items_org_proposal_position_unique
    unique (organization_id, proposal_id, position),
  constraint proposal_items_org_proposal_id_unique
    unique (organization_id, proposal_id, id),
  constraint proposal_items_position_positive check (position > 0),
  constraint proposal_items_name_not_blank check (length(btrim(service_name_snapshot)) > 0),
  constraint proposal_items_description_not_blank check (length(btrim(description)) > 0),
  constraint proposal_items_quantity_positive check (quantity > 0),
  constraint proposal_items_unit_price_nonnegative check (unit_price >= 0),
  constraint proposal_items_discount_valid check (
    discount_amount >= 0 and discount_amount <= round(quantity * unit_price, 2)
  ),
  constraint proposal_items_proposal_same_org_fk foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id) on delete cascade,
  constraint proposal_items_service_same_org_fk foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint proposal_items_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index proposal_items_org_proposal_idx
  on public.proposal_items (organization_id, proposal_id, position);
create index proposal_items_org_service_idx
  on public.proposal_items (organization_id, service_id)
  where service_id is not null;

create table public.proposal_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null,
  logical_file_id uuid not null default gen_random_uuid(),
  version integer not null default 1,
  supersedes_attachment_id uuid,
  document_kind text not null default 'proposal_pdf',
  original_file_name text not null,
  storage_bucket text not null default 'proposal-documents',
  storage_object_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text,
  is_current boolean not null default true,
  storage_deleted_at timestamptz,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint proposal_attachments_org_proposal_id_unique
    unique (organization_id, proposal_id, id),
  constraint proposal_attachments_version_unique
    unique (organization_id, proposal_id, logical_file_id, version),
  constraint proposal_attachments_supersedes_unique
    unique (organization_id, proposal_id, supersedes_attachment_id),
  constraint proposal_attachments_storage_path_unique unique (storage_object_path),
  constraint proposal_attachments_version_positive check (version > 0),
  constraint proposal_attachments_kind_valid check (
    document_kind in ('proposal_pdf', 'supplement', 'other')
  ),
  constraint proposal_attachments_file_name_not_blank
    check (length(btrim(original_file_name)) > 0),
  constraint proposal_attachments_bucket_fixed
    check (storage_bucket = 'proposal-documents'),
  constraint proposal_attachments_pdf_only
    check (mime_type = 'application/pdf' and lower(storage_object_path) like '%.pdf'),
  constraint proposal_attachments_size_valid
    check (size_bytes > 0 and size_bytes <= 20971520),
  constraint proposal_attachments_safe_path check (
    position('..' in storage_object_path) = 0
    and position(E'\\' in storage_object_path) = 0
    and storage_object_path like
      organization_id::text || '/' || proposal_id::text || '/' || id::text || '/%'
  ),
  constraint proposal_attachments_checksum_format check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint proposal_attachments_proposal_same_org_fk foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id) on delete cascade,
  constraint proposal_attachments_supersedes_same_proposal_fk
    foreign key (organization_id, proposal_id, supersedes_attachment_id)
    references public.proposal_attachments (organization_id, proposal_id, id) on delete restrict,
  constraint proposal_attachments_uploader_member_fk foreign key (organization_id, uploaded_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index proposal_attachments_one_current_version
  on public.proposal_attachments (organization_id, proposal_id, logical_file_id)
  where is_current and storage_deleted_at is null;
create index proposal_attachments_org_proposal_idx
  on public.proposal_attachments (organization_id, proposal_id, created_at desc);

create table public.proposal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  description text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint proposal_events_type_valid check (
    event_type in (
      'created', 'status_changed', 'sent', 'approved', 'rejected',
      'cancelled', 'expired', 'revision_created', 'attachment_added',
      'attachment_replaced', 'note'
    )
  ),
  constraint proposal_events_data_object check (jsonb_typeof(event_data) = 'object'),
  constraint proposal_events_proposal_same_org_fk foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id) on delete cascade,
  constraint proposal_events_actor_member_fk foreign key (organization_id, actor_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index proposal_events_org_proposal_date_idx
  on public.proposal_events (organization_id, proposal_id, occurred_at desc);

create or replace function private.next_document_number(
  target_organization_id uuid,
  target_document_type text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_number bigint;
begin
  if target_document_type <> 'proposal' then
    raise exception 'unsupported document type';
  end if;

  insert into private.organization_document_counters (
    organization_id,
    document_type,
    last_value
  )
  values (target_organization_id, target_document_type, 1)
  on conflict (organization_id, document_type) do update
    set last_value = private.organization_document_counters.last_value + 1,
        updated_at = statement_timestamp()
  returning last_value into generated_number;

  return generated_number;
end;
$$;

create or replace function private.prepare_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_allowed boolean;
  previous_revision record;
begin
  if tg_op = 'INSERT' then
    if new.supersedes_proposal_id is null then
      new.revision_group_id := new.id;
      new.revision_number := 1;
    else
      select
        proposal.client_id,
        proposal.opportunity_id,
        proposal.revision_group_id,
        proposal.revision_number
      into previous_revision
      from public.proposals proposal
      where proposal.organization_id = new.organization_id
        and proposal.id = new.supersedes_proposal_id
      for update;

      if not found then
        raise exception 'superseded proposal not found in organization';
      end if;

      new.client_id := previous_revision.client_id;
      new.opportunity_id := previous_revision.opportunity_id;
      new.revision_group_id := previous_revision.revision_group_id;
      new.revision_number := previous_revision.revision_number + 1;
    end if;

    new.proposal_number := private.next_document_number(new.organization_id, 'proposal');
    new.code := 'PROP-' || lpad(new.proposal_number::text, 6, '0');
    new.status := 'draft';
    new.sent_at := null;
    new.approved_at := null;
    new.approved_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
    new.cancelled_at := null;
    new.subtotal_amount := 0;
    new.discount_amount := 0;
    new.total_amount := 0;
    return new;
  end if;

  if old.status in ('approved', 'rejected', 'expired', 'cancelled')
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'terminal proposals are immutable; create a revision';
  end if;

  if new.status is distinct from old.status then
    transition_allowed := case old.status
      when 'draft' then new.status in ('sent', 'cancelled')
      when 'sent' then new.status in ('negotiating', 'approved', 'rejected', 'expired', 'cancelled')
      when 'negotiating' then new.status in ('sent', 'approved', 'rejected', 'expired', 'cancelled')
      else false
    end;

    if not transition_allowed then
      raise exception 'invalid proposal status transition from % to %', old.status, new.status;
    end if;

    if new.status = 'sent' then
      new.sent_at := coalesce(old.sent_at, statement_timestamp());
    elsif new.status = 'approved' then
      new.approved_at := statement_timestamp();
      new.approved_by := auth.uid();
      new.rejected_at := null;
      new.rejection_reason := null;
      new.cancelled_at := null;
    elsif new.status = 'rejected' then
      if new.rejection_reason is null or length(btrim(new.rejection_reason)) = 0 then
        raise exception 'rejection reason is required';
      end if;
      new.rejected_at := statement_timestamp();
      new.approved_at := null;
      new.approved_by := null;
      new.cancelled_at := null;
    elsif new.status = 'cancelled' then
      new.cancelled_at := statement_timestamp();
      new.approved_at := null;
      new.approved_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    elsif new.status = 'expired' then
      new.approved_at := null;
      new.approved_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
      new.cancelled_at := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.prepare_proposal_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_attachment record;
begin
  if new.supersedes_attachment_id is null then
    new.version := 1;
    new.logical_file_id := new.id;
    new.is_current := true;
    new.storage_deleted_at := null;
    return new;
  end if;

  select attachment.logical_file_id, attachment.version, attachment.is_current
    into previous_attachment
  from public.proposal_attachments attachment
  where attachment.organization_id = new.organization_id
    and attachment.proposal_id = new.proposal_id
    and attachment.id = new.supersedes_attachment_id
  for update;

  if not found then
    raise exception 'superseded attachment not found in proposal';
  end if;
  if not previous_attachment.is_current then
    raise exception 'only the current attachment version can be replaced';
  end if;

  update public.proposal_attachments attachment
  set is_current = false
  where attachment.organization_id = new.organization_id
    and attachment.proposal_id = new.proposal_id
    and attachment.id = new.supersedes_attachment_id;

  new.logical_file_id := previous_attachment.logical_file_id;
  new.version := previous_attachment.version + 1;
  new.is_current := true;
  new.storage_deleted_at := null;
  return new;
end;
$$;

create or replace function private.prevent_protected_columns_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  column_name text;
begin
  foreach column_name in array tg_argv loop
    if (to_jsonb(new) -> column_name) is distinct from (to_jsonb(old) -> column_name) then
      raise exception '% cannot be changed', column_name;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.recalculate_proposal_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_proposal_id uuid;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_proposal_id := old.proposal_id;
  else
    target_organization_id := new.organization_id;
    target_proposal_id := new.proposal_id;
  end if;

  update public.proposals proposal
  set subtotal_amount = totals.subtotal_amount,
      discount_amount = totals.discount_amount,
      total_amount = totals.subtotal_amount - totals.discount_amount
  from (
    select
      coalesce(round(sum(item.quantity * item.unit_price), 2), 0)::numeric(16,2) as subtotal_amount,
      coalesce(round(sum(item.discount_amount), 2), 0)::numeric(16,2) as discount_amount
    from public.proposal_items item
    where item.organization_id = target_organization_id
      and item.proposal_id = target_proposal_id
  ) totals
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id;

  return null;
end;
$$;

create or replace function private.record_proposal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_event_type text;
  actor_id uuid;
begin
  actor_id := coalesce(auth.uid(), new.created_by);

  if tg_op = 'INSERT' then
    insert into public.proposal_events (
      organization_id, proposal_id, event_type, actor_user_id, description
    ) values (
      new.organization_id,
      new.id,
      case when new.supersedes_proposal_id is null then 'created' else 'revision_created' end,
      actor_id,
      case when new.supersedes_proposal_id is null then 'Proposta criada' else 'Revisão de proposta criada' end
    );
  elsif new.status is distinct from old.status then
    recorded_event_type := case new.status
      when 'sent' then 'sent'
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'cancelled' then 'cancelled'
      when 'expired' then 'expired'
      else 'status_changed'
    end;
    insert into public.proposal_events (
      organization_id, proposal_id, event_type, actor_user_id, description, event_data
    ) values (
      new.organization_id,
      new.id,
      recorded_event_type,
      actor_id,
      'Status alterado de ' || old.status || ' para ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return null;
end;
$$;

create or replace function private.record_attachment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.proposal_events (
    organization_id,
    proposal_id,
    event_type,
    actor_user_id,
    description,
    event_data
  ) values (
    new.organization_id,
    new.proposal_id,
    case when new.supersedes_attachment_id is null then 'attachment_added' else 'attachment_replaced' end,
    new.uploaded_by,
    case when new.supersedes_attachment_id is null then 'Documento anexado' else 'Documento substituído' end,
    jsonb_build_object('attachment_id', new.id, 'version', new.version)
  );
  return null;
end;
$$;

create or replace function public.approve_proposal(target_proposal_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_proposal record;
begin
  select proposal.id, proposal.organization_id, proposal.status
    into current_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
  for update;

  if not found then
    raise exception 'proposal not found or access denied';
  end if;

  if current_proposal.status = 'approved' then
    return current_proposal.id;
  end if;

  if current_proposal.status not in ('sent', 'negotiating') then
    raise exception 'proposal cannot be approved from status %', current_proposal.status;
  end if;

  update public.proposals proposal
  set status = 'approved'
  where proposal.id = current_proposal.id
    and proposal.organization_id = current_proposal.organization_id;

  return current_proposal.id;
end;
$$;

revoke all on function private.next_document_number(uuid, text) from public, anon, authenticated;
revoke all on function private.prepare_proposal() from public, anon, authenticated;
revoke all on function private.prepare_proposal_attachment() from public, anon, authenticated;
revoke all on function private.prevent_protected_columns_change() from public, anon, authenticated;
revoke all on function private.recalculate_proposal_totals() from public, anon, authenticated;
revoke all on function private.record_proposal_event() from public, anon, authenticated;
revoke all on function private.record_attachment_event() from public, anon, authenticated;
revoke all on function public.approve_proposal(uuid) from public, anon, authenticated;
grant execute on function public.approve_proposal(uuid) to authenticated;

create trigger services_identity_immutable before update on public.services
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'created_by', 'created_at'
  );
create trigger services_set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger proposals_identity_immutable before update on public.proposals
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'client_id', 'proposal_number', 'code', 'revision_group_id',
    'revision_number', 'supersedes_proposal_id', 'created_by', 'created_at'
  );
create trigger proposals_prepare_state before insert or update on public.proposals
  for each row execute function private.prepare_proposal();
create trigger proposals_set_updated_at before update on public.proposals
  for each row execute function private.set_updated_at();
create trigger proposals_record_event after insert or update on public.proposals
  for each row execute function private.record_proposal_event();

create trigger proposal_items_identity_immutable before update on public.proposal_items
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'proposal_id', 'created_by', 'created_at'
  );
create trigger proposal_items_set_updated_at before update on public.proposal_items
  for each row execute function private.set_updated_at();
create trigger proposal_items_recalculate_totals
  after insert or update or delete on public.proposal_items
  for each row execute function private.recalculate_proposal_totals();

create trigger proposal_attachments_identity_immutable before update on public.proposal_attachments
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'proposal_id', 'logical_file_id', 'version',
    'supersedes_attachment_id', 'original_file_name', 'storage_bucket',
    'storage_object_path', 'mime_type', 'size_bytes', 'checksum_sha256',
    'uploaded_by', 'created_at'
  );
create trigger proposal_attachments_prepare before insert on public.proposal_attachments
  for each row execute function private.prepare_proposal_attachment();
create trigger proposal_attachments_record_event after insert on public.proposal_attachments
  for each row execute function private.record_attachment_event();

alter table public.services enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_attachments enable row level security;
alter table public.proposal_events enable row level security;

revoke all on table public.services from public, anon, authenticated;
revoke all on table public.proposals from public, anon, authenticated;
revoke all on table public.proposal_items from public, anon, authenticated;
revoke all on table public.proposal_attachments from public, anon, authenticated;
revoke all on table public.proposal_events from public, anon, authenticated;

grant select, insert, update, delete on table public.services to authenticated;
grant select, insert on table public.proposals to authenticated;
grant update (
  opportunity_id, title, status, valid_until, payment_terms,
  execution_deadline, notes, commercial_terms, rejection_reason
) on table public.proposals to authenticated;
grant select, insert, update, delete on table public.proposal_items to authenticated;
grant select, insert on table public.proposal_attachments to authenticated;
grant update (is_current, storage_deleted_at)
  on table public.proposal_attachments to authenticated;
grant select on table public.proposal_events to authenticated;

create policy services_select_active_members
  on public.services for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy services_insert_admins
  on public.services for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
create policy services_update_admins
  on public.services for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy services_delete_admins
  on public.services for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy proposals_select_active_members
  on public.proposals for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy proposals_insert_active_members
  on public.proposals for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy proposals_update_active_members
  on public.proposals for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));

create policy proposal_items_select_active_members
  on public.proposal_items for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy proposal_items_insert_draft
  on public.proposal_items for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_items.organization_id
        and proposal.id = proposal_items.proposal_id
        and proposal.status = 'draft'
    )
  );
create policy proposal_items_update_draft
  on public.proposal_items for update to authenticated
  using (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_items.organization_id
        and proposal.id = proposal_items.proposal_id
        and proposal.status = 'draft'
    )
  )
  with check (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_items.organization_id
        and proposal.id = proposal_items.proposal_id
        and proposal.status = 'draft'
    )
  );
create policy proposal_items_delete_draft
  on public.proposal_items for delete to authenticated
  using (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_items.organization_id
        and proposal.id = proposal_items.proposal_id
        and proposal.status = 'draft'
    )
  );

create policy proposal_attachments_select_active_members
  on public.proposal_attachments for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy proposal_attachments_insert_active_members
  on public.proposal_attachments for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and uploaded_by = (select auth.uid())
  );
create policy proposal_attachments_update_uploader_or_admin
  on public.proposal_attachments for update to authenticated
  using (
    private.is_active_org_member(organization_id)
    and (
      uploaded_by = (select auth.uid())
      or private.has_org_role(organization_id, array['owner', 'admin'])
    )
  )
  with check (
    private.is_active_org_member(organization_id)
    and (
      uploaded_by = (select auth.uid())
      or private.has_org_role(organization_id, array['owner', 'admin'])
    )
  );

create policy proposal_events_select_active_members
  on public.proposal_events for select to authenticated
  using (private.is_active_org_member(organization_id));

comment on table public.services is 'Catálogo por organização; itens de proposta preservam snapshot e podem não referenciar um serviço.';
comment on column public.proposals.proposal_number is 'Sequencial monotônico por organização, alocado atomicamente no banco.';
comment on column public.proposals.revision_group_id is 'Agrupa revisões sem sobrescrever propostas já emitidas ou encerradas.';
comment on column public.proposal_items.line_total is 'Calculado pelo PostgreSQL; não aceitar valor informado pelo cliente.';
comment on table public.proposal_events is 'Histórico append-only; eventos automáticos são registrados por triggers.';

commit;
