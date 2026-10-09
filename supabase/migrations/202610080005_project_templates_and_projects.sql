begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_templates_org_id_unique unique (organization_id, id),
  constraint project_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint project_templates_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index project_templates_org_name_unique
  on public.project_templates (organization_id, lower(name));
create index project_templates_org_active_idx
  on public.project_templates (organization_id, is_active, name);

create table public.project_template_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  name text not null,
  description text,
  position integer not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_template_stages_org_id_unique unique (organization_id, id),
  constraint project_template_stages_org_template_id_unique
    unique (organization_id, template_id, id),
  constraint project_template_stages_position_unique
    unique (organization_id, template_id, position),
  constraint project_template_stages_name_not_blank check (length(btrim(name)) > 0),
  constraint project_template_stages_position_positive check (position > 0),
  constraint project_template_stages_template_same_org_fk foreign key (organization_id, template_id)
    references public.project_templates (organization_id, id) on delete cascade,
  constraint project_template_stages_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index project_template_stages_org_template_idx
  on public.project_template_stages (organization_id, template_id, position);

create table public.project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  template_stage_id uuid,
  title text not null,
  description text,
  position integer not null,
  priority text not null default 'medium',
  estimated_days integer,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_template_tasks_org_id_unique unique (organization_id, id),
  constraint project_template_tasks_title_not_blank check (length(btrim(title)) > 0),
  constraint project_template_tasks_position_positive check (position > 0),
  constraint project_template_tasks_priority_valid check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint project_template_tasks_estimate_nonnegative check (
    estimated_days is null or estimated_days >= 0
  ),
  constraint project_template_tasks_template_same_org_fk foreign key (organization_id, template_id)
    references public.project_templates (organization_id, id) on delete cascade,
  constraint project_template_tasks_stage_same_template_fk
    foreign key (organization_id, template_id, template_stage_id)
    references public.project_template_stages (organization_id, template_id, id) on delete cascade,
  constraint project_template_tasks_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index project_template_tasks_org_template_stage_idx
  on public.project_template_tasks (organization_id, template_id, template_stage_id, position);
create unique index project_template_tasks_stage_position_unique
  on public.project_template_tasks (organization_id, template_id, template_stage_id, position)
  where template_stage_id is not null;
create unique index project_template_tasks_root_position_unique
  on public.project_template_tasks (organization_id, template_id, position)
  where template_stage_id is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  proposal_id uuid,
  source_template_id uuid,
  name text not null,
  description text,
  notes text,
  status text not null default 'planning',
  priority text not null default 'medium',
  owner_user_id uuid,
  start_date date,
  expected_end_date date,
  completed_at timestamptz,
  published_at timestamptz,
  reference_url text,
  published_url text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_org_id_unique unique (organization_id, id),
  constraint projects_name_not_blank check (length(btrim(name)) > 0),
  constraint projects_status_valid check (
    status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')
  ),
  constraint projects_priority_valid check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint projects_dates_valid check (
    expected_end_date is null or start_date is null or expected_end_date >= start_date
  ),
  constraint projects_completion_state_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint projects_reference_url_valid check (
    reference_url is null or reference_url ~ '^https?://'
  ),
  constraint projects_published_url_valid check (
    published_url is null or published_url ~ '^https?://'
  ),
  constraint projects_client_same_org_fk foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint projects_proposal_client_same_org_fk
    foreign key (organization_id, proposal_id, client_id)
    references public.proposals (organization_id, id, client_id) on delete restrict,
  constraint projects_template_same_org_fk foreign key (organization_id, source_template_id)
    references public.project_templates (organization_id, id) on delete restrict,
  constraint projects_owner_member_fk foreign key (organization_id, owner_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint projects_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index projects_one_per_proposal_unique
  on public.projects (organization_id, proposal_id)
  where proposal_id is not null;
create index projects_org_status_priority_idx
  on public.projects (organization_id, status, priority, updated_at desc);
create index projects_org_client_idx
  on public.projects (organization_id, client_id, created_at desc);
create index projects_org_owner_idx
  on public.projects (organization_id, owner_user_id)
  where owner_user_id is not null;

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  source_template_stage_id uuid,
  name text not null,
  description text,
  position integer not null,
  status text not null default 'pending',
  responsible_user_id uuid,
  planned_start_date date,
  planned_end_date date,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_stages_org_project_id_unique unique (organization_id, project_id, id),
  constraint project_stages_position_unique unique (organization_id, project_id, position),
  constraint project_stages_name_not_blank check (length(btrim(name)) > 0),
  constraint project_stages_position_positive check (position > 0),
  constraint project_stages_status_valid check (
    status in ('pending', 'in_progress', 'completed', 'skipped')
  ),
  constraint project_stages_dates_valid check (
    planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date
  ),
  constraint project_stages_completion_state_valid check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint project_stages_project_same_org_fk foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint project_stages_source_same_org_fk foreign key (organization_id, source_template_stage_id)
    references public.project_template_stages (organization_id, id) on delete restrict,
  constraint project_stages_responsible_member_fk foreign key (organization_id, responsible_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint project_stages_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index project_stages_org_project_idx
  on public.project_stages (organization_id, project_id, position);
create index project_stages_org_responsible_idx
  on public.project_stages (organization_id, responsible_user_id)
  where responsible_user_id is not null;

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  project_stage_id uuid,
  source_template_task_id uuid,
  title text not null,
  description text,
  position integer not null,
  status text not null default 'todo',
  priority text not null default 'medium',
  assigned_to uuid,
  due_date date,
  completed_at timestamptz,
  reference_url text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tasks_org_id_unique unique (organization_id, id),
  constraint project_tasks_title_not_blank check (length(btrim(title)) > 0),
  constraint project_tasks_position_positive check (position > 0),
  constraint project_tasks_status_valid check (
    status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')
  ),
  constraint project_tasks_priority_valid check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint project_tasks_completion_state_valid check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  ),
  constraint project_tasks_reference_url_valid check (
    reference_url is null or reference_url ~ '^https?://'
  ),
  constraint project_tasks_project_same_org_fk foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint project_tasks_stage_same_project_fk
    foreign key (organization_id, project_id, project_stage_id)
    references public.project_stages (organization_id, project_id, id) on delete cascade,
  constraint project_tasks_source_same_org_fk foreign key (organization_id, source_template_task_id)
    references public.project_template_tasks (organization_id, id) on delete restrict,
  constraint project_tasks_assignee_member_fk foreign key (organization_id, assigned_to)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint project_tasks_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index project_tasks_org_project_status_idx
  on public.project_tasks (organization_id, project_id, status, position);
create index project_tasks_org_stage_idx
  on public.project_tasks (organization_id, project_id, project_stage_id, position);
create unique index project_tasks_stage_position_unique
  on public.project_tasks (organization_id, project_id, project_stage_id, position)
  where project_stage_id is not null;
create unique index project_tasks_root_position_unique
  on public.project_tasks (organization_id, project_id, position)
  where project_stage_id is null;
create index project_tasks_org_assignee_due_idx
  on public.project_tasks (organization_id, assigned_to, due_date)
  where assigned_to is not null and status not in ('done', 'cancelled');

create or replace function private.require_active_assignee()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  assignee_id uuid;
begin
  assignee_id := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  if assignee_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_members membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where membership.organization_id = new.organization_id
      and membership.user_id = assignee_id
      and membership.status = 'active'
      and organization.status = 'active'
  ) then
    raise exception 'assignee must be an active member of the organization';
  end if;

  return new;
end;
$$;

create or replace function private.prepare_project()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_proposal_status text;
  transition_allowed boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'planning';
    new.completed_at := null;
  elsif new.status is distinct from old.status then
    transition_allowed := case old.status
      when 'planning' then new.status in ('active', 'on_hold', 'cancelled')
      when 'active' then new.status in ('on_hold', 'completed', 'cancelled')
      when 'on_hold' then new.status in ('active', 'cancelled')
      else false
    end;
    if not transition_allowed then
      raise exception 'invalid project status transition from % to %', old.status, new.status;
    end if;
    new.completed_at := case when new.status = 'completed' then statement_timestamp() else null end;
  end if;

  if new.proposal_id is not null then
    select proposal.status into source_proposal_status
    from public.proposals proposal
    where proposal.organization_id = new.organization_id
      and proposal.id = new.proposal_id
      and proposal.client_id = new.client_id;
    if source_proposal_status is distinct from 'approved' then
      raise exception 'projects can only be linked to an approved proposal from the same client';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.sync_project_stage_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := statement_timestamp();
  end if;
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, statement_timestamp());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.sync_project_task_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, statement_timestamp());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.require_active_assignee() from public, anon, authenticated;
revoke all on function private.prepare_project() from public, anon, authenticated;
revoke all on function private.sync_project_stage_state() from public, anon, authenticated;
revoke all on function private.sync_project_task_state() from public, anon, authenticated;

create trigger project_templates_identity_immutable before update on public.project_templates
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'created_by', 'created_at'
  );
create trigger project_templates_set_updated_at before update on public.project_templates
  for each row execute function private.set_updated_at();

create trigger project_template_stages_identity_immutable before update on public.project_template_stages
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'template_id', 'created_by', 'created_at'
  );
create trigger project_template_stages_set_updated_at before update on public.project_template_stages
  for each row execute function private.set_updated_at();

create trigger project_template_tasks_identity_immutable before update on public.project_template_tasks
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'template_id', 'created_by', 'created_at'
  );
create trigger project_template_tasks_set_updated_at before update on public.project_template_tasks
  for each row execute function private.set_updated_at();

create trigger projects_active_owner before insert or update on public.projects
  for each row execute function private.require_active_assignee('owner_user_id');
create trigger projects_identity_immutable before update on public.projects
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'client_id', 'proposal_id', 'source_template_id',
    'created_by', 'created_at'
  );
create trigger projects_prepare before insert or update on public.projects
  for each row execute function private.prepare_project();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

create trigger project_stages_active_responsible before insert or update on public.project_stages
  for each row execute function private.require_active_assignee('responsible_user_id');
create trigger project_stages_identity_immutable before update on public.project_stages
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'project_id', 'source_template_stage_id',
    'created_by', 'created_at'
  );
create trigger project_stages_sync_state before insert or update on public.project_stages
  for each row execute function private.sync_project_stage_state();
create trigger project_stages_set_updated_at before update on public.project_stages
  for each row execute function private.set_updated_at();

create trigger project_tasks_active_assignee before insert or update on public.project_tasks
  for each row execute function private.require_active_assignee('assigned_to');
create trigger project_tasks_identity_immutable before update on public.project_tasks
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'project_id', 'source_template_task_id',
    'created_by', 'created_at'
  );
create trigger project_tasks_sync_state before insert or update on public.project_tasks
  for each row execute function private.sync_project_task_state();
create trigger project_tasks_set_updated_at before update on public.project_tasks
  for each row execute function private.set_updated_at();

alter table public.project_templates enable row level security;
alter table public.project_template_stages enable row level security;
alter table public.project_template_tasks enable row level security;
alter table public.projects enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_tasks enable row level security;

revoke all on table public.project_templates from public, anon, authenticated;
revoke all on table public.project_template_stages from public, anon, authenticated;
revoke all on table public.project_template_tasks from public, anon, authenticated;
revoke all on table public.projects from public, anon, authenticated;
revoke all on table public.project_stages from public, anon, authenticated;
revoke all on table public.project_tasks from public, anon, authenticated;

grant select, insert, update, delete on table public.project_templates to authenticated;
grant select, insert, update, delete on table public.project_template_stages to authenticated;
grant select, insert, update, delete on table public.project_template_tasks to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_stages to authenticated;
grant select, insert, update, delete on table public.project_tasks to authenticated;

create policy project_templates_select_active_members
  on public.project_templates for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy project_templates_insert_admins
  on public.project_templates for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
create policy project_templates_update_admins
  on public.project_templates for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy project_templates_delete_admins
  on public.project_templates for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy project_template_stages_select_active_members
  on public.project_template_stages for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy project_template_stages_insert_admins
  on public.project_template_stages for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
create policy project_template_stages_update_admins
  on public.project_template_stages for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy project_template_stages_delete_admins
  on public.project_template_stages for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy project_template_tasks_select_active_members
  on public.project_template_tasks for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy project_template_tasks_insert_admins
  on public.project_template_tasks for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
create policy project_template_tasks_update_admins
  on public.project_template_tasks for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy project_template_tasks_delete_admins
  on public.project_template_tasks for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy projects_select_active_members
  on public.projects for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy projects_insert_active_members
  on public.projects for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy projects_update_active_members
  on public.projects for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));
create policy projects_delete_admins
  on public.projects for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy project_stages_select_active_members
  on public.project_stages for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy project_stages_insert_active_members
  on public.project_stages for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy project_stages_update_active_members
  on public.project_stages for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));
create policy project_stages_delete_admins
  on public.project_stages for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy project_tasks_select_active_members
  on public.project_tasks for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy project_tasks_insert_active_members
  on public.project_tasks for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy project_tasks_update_active_members
  on public.project_tasks for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));
create policy project_tasks_delete_admins
  on public.project_tasks for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

comment on table public.project_templates is 'Modelos por organização; a aplicação da etapa 4C deverá copiar etapas e tarefas em uma transação.';
comment on column public.projects.proposal_id is 'Opcional; somente proposta aprovada do mesmo cliente e organização, com unicidade concorrente.';
comment on table public.project_stages is 'Snapshot independente de uma etapa de template; alterações no template não propagam.';
comment on table public.project_tasks is 'Progresso deve ser calculado por contagem de tarefas done, excluindo cancelled.';

commit;
