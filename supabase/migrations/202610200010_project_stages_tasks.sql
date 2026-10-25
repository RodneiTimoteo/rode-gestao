begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Etapa 4C.2 depende da fundacao auditavel criada pela migration 009.
do $$
begin
  if to_regclass('public.project_events') is null then
    raise exception 'migration 009 must be applied before migration 010';
  end if;
end;
$$;

-- Etapas arquivadas continuam consultaveis e preservam tarefas e historico.
alter table public.project_stages
  add column archived_at timestamptz,
  add column archived_by uuid,
  add constraint project_stages_archive_state_valid check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  ),
  add constraint project_stages_archiver_member_fk
    foreign key (organization_id, archived_by)
    references public.organization_members (organization_id, user_id) on delete restrict;

alter table public.project_stages
  drop constraint project_stages_position_unique;

-- Migra tarefas legadas sem etapa para uma etapa explicita, sem tocar em templates.
-- O trigger herdado da 005 protege project_stage_id; ele precisa sair antes do
-- backfill e sera recriado abaixo com a mesma protecao para operacoes futuras.
drop trigger project_tasks_identity_immutable on public.project_tasks;
alter table public.project_stages disable trigger project_stages_active_responsible;
alter table public.project_stages disable trigger project_stages_sync_state;
alter table public.project_stages disable trigger project_stages_set_updated_at;
alter table public.project_tasks disable trigger project_tasks_active_assignee;
alter table public.project_tasks disable trigger project_tasks_sync_state;
alter table public.project_tasks disable trigger project_tasks_set_updated_at;

create temporary table legacy_project_task_stages (
  organization_id uuid not null,
  project_id uuid primary key,
  project_stage_id uuid not null
) on commit drop;

-- Compacta somente projetos cujo proximo valor estouraria integer. Nos demais,
-- as posicoes legadas permanecem intactas; quando necessario, a ordem e preservada.
with affected_projects as (
  select distinct task.organization_id, task.project_id
  from public.project_tasks task
  where task.project_stage_id is null
), projects_requiring_compaction as (
  select affected.organization_id, affected.project_id
  from affected_projects affected
  join public.project_stages stage
    on stage.organization_id = affected.organization_id
   and stage.project_id = affected.project_id
  group by affected.organization_id, affected.project_id
  having max(stage.position) = 2147483647
), ordered_stages as (
  select
    stage.id,
    row_number() over (
      partition by stage.organization_id, stage.project_id
      order by stage.position, stage.id
    )::integer as position
  from public.project_stages stage
  join projects_requiring_compaction affected
    on affected.organization_id = stage.organization_id
   and affected.project_id = stage.project_id
)
update public.project_stages stage
set position = ordered.position
from ordered_stages ordered
where stage.id = ordered.id;

with inserted as (
  insert into public.project_stages (
    organization_id, project_id, name, description, position, created_by
  )
  select
    project.organization_id,
    project.id,
    'Sem etapa',
    'Etapa criada automaticamente para preservar tarefas legadas.',
    coalesce((
      select max(stage.position)
      from public.project_stages stage
      where stage.organization_id = project.organization_id
        and stage.project_id = project.id
        and stage.archived_at is null
    ), 0) + 1,
    project.created_by
  from public.projects project
  where exists (
    select 1
    from public.project_tasks task
    where task.organization_id = project.organization_id
      and task.project_id = project.id
      and task.project_stage_id is null
  )
  returning organization_id, project_id, id
)
insert into legacy_project_task_stages (organization_id, project_id, project_stage_id)
select organization_id, project_id, id from inserted;

update public.project_tasks task
set project_stage_id = legacy.project_stage_id
from legacy_project_task_stages legacy
where task.organization_id = legacy.organization_id
  and task.project_id = legacy.project_id
  and task.project_stage_id is null;

alter table public.project_stages enable trigger project_stages_active_responsible;
alter table public.project_stages enable trigger project_stages_sync_state;
alter table public.project_stages enable trigger project_stages_set_updated_at;
alter table public.project_tasks enable trigger project_tasks_active_assignee;
alter table public.project_tasks enable trigger project_tasks_sync_state;
alter table public.project_tasks enable trigger project_tasks_set_updated_at;

create unique index project_stages_active_position_unique
  on public.project_stages (organization_id, project_id, position)
  where archived_at is null;

create index project_stages_org_project_archived_idx
  on public.project_stages (organization_id, project_id, archived_at, position);

alter table public.project_tasks
  alter column project_stage_id set not null,
  drop constraint project_tasks_stage_same_project_fk,
  add constraint project_tasks_stage_same_project_fk
    foreign key (organization_id, project_id, project_stage_id)
    references public.project_stages (organization_id, project_id, id) on delete restrict,
  add constraint project_tasks_org_project_id_unique
    unique (organization_id, project_id, id);

drop index public.project_tasks_root_position_unique;

-- Checklist plano, auditavel e vinculado por chaves compostas ao mesmo tenant/projeto/tarefa.
create table public.project_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  task_id uuid not null,
  title text not null,
  position integer not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_task_checklist_items_org_id_unique
    unique (organization_id, id),
  constraint project_task_checklist_items_org_project_task_id_unique
    unique (organization_id, project_id, task_id, id),
  constraint project_task_checklist_items_title_valid check (
    length(btrim(title)) between 1 and 500
  ),
  constraint project_task_checklist_items_position_positive check (position > 0),
  constraint project_task_checklist_items_completion_state_valid check (
    (is_completed and completed_at is not null and completed_by is not null)
    or (not is_completed and completed_at is null and completed_by is null)
  ),
  constraint project_task_checklist_items_archive_state_valid check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  ),
  constraint project_task_checklist_items_project_same_org_fk
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint project_task_checklist_items_task_same_project_fk
    foreign key (organization_id, project_id, task_id)
    references public.project_tasks (organization_id, project_id, id) on delete cascade,
  constraint project_task_checklist_items_completer_member_fk
    foreign key (organization_id, completed_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint project_task_checklist_items_archiver_member_fk
    foreign key (organization_id, archived_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint project_task_checklist_items_creator_member_fk
    foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index project_task_checklist_items_active_position_unique
  on public.project_task_checklist_items (organization_id, project_id, task_id, position)
  where archived_at is null;

create index project_task_checklist_items_org_task_idx
  on public.project_task_checklist_items (
    organization_id, project_id, task_id, archived_at, position
  );

-- Identifica a entidade auditada sem invalidar eventos criados pela migration 009.
alter table public.project_events
  add column subject_type text,
  add column subject_id uuid,
  add column actor_name_snapshot text;

update public.project_events event
set subject_type = 'project',
    subject_id = event.project_id,
    actor_name_snapshot = coalesce(
      (select nullif(btrim(profile.display_name), '')
       from public.profiles profile
       where profile.id = event.actor_user_id),
      'Membro ' || upper(left(event.actor_user_id::text, 8))
    );

alter table public.project_events
  alter column subject_type set default 'project',
  alter column subject_type set not null,
  alter column subject_id set not null,
  alter column actor_name_snapshot set not null,
  add constraint project_events_subject_type_valid check (
    subject_type in ('project', 'stage', 'task', 'checklist_item')
  ),
  drop constraint project_events_type_valid,
  add constraint project_events_type_valid check (
    event_type in (
      'created', 'created_from_proposal', 'status_changed',
      'owner_changed', 'deadline_changed', 'completed', 'cancelled',
      'stage_created', 'stage_updated', 'stage_reordered', 'stage_archived',
      'task_created', 'task_updated', 'task_status_changed',
      'task_completed', 'task_reopened', 'task_assignee_changed',
      'task_deadline_changed', 'task_reordered',
      'checklist_item_created', 'checklist_item_updated',
      'checklist_item_completed', 'checklist_item_reopened',
      'checklist_item_archived', 'checklist_reordered'
    )
  );

create index project_events_org_project_subject_date_idx
  on public.project_events (
    organization_id, project_id, subject_type, subject_id, occurred_at desc, id desc
  );

create or replace function private.prepare_project_event_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.subject_type := coalesce(new.subject_type, 'project');
  new.subject_id := coalesce(new.subject_id, new.project_id);
  new.actor_name_snapshot := coalesce(
    nullif(btrim(new.actor_name_snapshot), ''),
    (select nullif(btrim(profile.display_name), '')
     from public.profiles profile
     where profile.id = new.actor_user_id),
    'Membro ' || upper(left(new.actor_user_id::text, 8))
  );
  return new;
end;
$$;

create trigger project_events_prepare_subject
  before insert on public.project_events
  for each row execute function private.prepare_project_event_subject();

create or replace function private.append_project_event(
  target_organization_id uuid,
  target_project_id uuid,
  target_event_type text,
  target_subject_type text,
  target_subject_id uuid,
  target_description text,
  target_event_data jsonb default '{}'::jsonb,
  target_justification text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.project_events (
    organization_id, project_id, event_type, actor_user_id, description,
    event_data, justification, subject_type, subject_id
  ) values (
    target_organization_id, target_project_id, target_event_type, auth.uid(),
    target_description, coalesce(target_event_data, '{}'::jsonb),
    nullif(btrim(target_justification), ''), target_subject_type, target_subject_id
  );
end;
$$;

create or replace function private.lock_operable_project(target_project_id uuid)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_project public.projects%rowtype;
begin
  if target_project_id is null then
    raise exception 'project id is required';
  end if;

  select project.* into locked_project
  from public.projects project
  where project.id = target_project_id
    and private.is_active_org_member(project.organization_id)
  for update;

  if not found then
    raise exception 'project not found or access denied' using errcode = '42501';
  end if;
  if locked_project.status in ('completed', 'cancelled') then
    raise exception 'terminal projects are immutable';
  end if;
  return locked_project;
end;
$$;

create or replace function private.guard_project_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_status text;
begin
  select project.status into parent_status
  from public.projects project
  where project.id = new.project_id
    and project.organization_id = new.organization_id
  for update;

  if not found then
    raise exception 'parent project not found';
  end if;

  if parent_status in ('completed', 'cancelled') then
    raise exception 'terminal projects are immutable';
  end if;

  if tg_table_name = 'project_stages' and tg_op = 'UPDATE'
     and old.archived_at is not null
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'archived stages are immutable';
  end if;

  if tg_table_name = 'project_tasks' and exists (
    select 1 from public.project_stages stage
    where stage.organization_id = new.organization_id
      and stage.project_id = new.project_id
      and stage.id = new.project_stage_id
      and stage.archived_at is not null
  ) then
    raise exception 'archived stages are immutable';
  end if;

  if tg_table_name = 'project_task_checklist_items' and exists (
    select 1
    from public.project_tasks task
    join public.project_stages stage
      on stage.organization_id = task.organization_id
     and stage.project_id = task.project_id
     and stage.id = task.project_stage_id
    where task.organization_id = new.organization_id
      and task.project_id = new.project_id
      and task.id = new.task_id
      and stage.archived_at is not null
  ) then
    raise exception 'archived stages are immutable';
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
  if tg_op = 'INSERT' then
    new.completed_at := case
      when new.status = 'done' then statement_timestamp()
      else null
    end;
  elsif new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := statement_timestamp();
  elsif new.status = 'done' then
    new.completed_at := old.completed_at;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function private.sync_project_checklist_item_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_completed then
      new.completed_at := statement_timestamp();
      new.completed_by := auth.uid();
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.is_completed and not old.is_completed then
    new.completed_at := statement_timestamp();
    new.completed_by := auth.uid();
  elsif new.is_completed then
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger project_tasks_identity_immutable before update on public.project_tasks
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'project_id', 'project_stage_id', 'source_template_task_id',
    'created_by', 'created_at'
  );

create trigger project_stages_guard_operable before insert or update on public.project_stages
  for each row execute function private.guard_project_child_mutation();
create trigger project_tasks_guard_operable before insert or update on public.project_tasks
  for each row execute function private.guard_project_child_mutation();

create trigger project_task_checklist_items_guard_operable
  before insert or update on public.project_task_checklist_items
  for each row execute function private.guard_project_child_mutation();
create trigger project_task_checklist_items_identity_immutable
  before update on public.project_task_checklist_items
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'project_id', 'task_id', 'created_by', 'created_at'
  );
create trigger project_task_checklist_items_sync_state
  before insert or update on public.project_task_checklist_items
  for each row execute function private.sync_project_checklist_item_state();
create trigger project_task_checklist_items_set_updated_at
  before update on public.project_task_checklist_items
  for each row execute function private.set_updated_at();

-- Views dinamicas: tarefas canceladas nao entram no denominador.
create view public.project_stage_progress
with (security_invoker = true)
as
select
  stage.organization_id,
  stage.project_id,
  stage.id as project_stage_id,
  count(task.id) filter (where task.status <> 'cancelled')::integer as eligible_tasks,
  count(task.id) filter (where task.status = 'done')::integer as completed_tasks,
  case
    when count(task.id) filter (where task.status <> 'cancelled') = 0 then 0
    else round(
      count(task.id) filter (where task.status = 'done') * 100.0
      / count(task.id) filter (where task.status <> 'cancelled')
    )::integer
  end as progress_percent
from public.project_stages stage
left join public.project_tasks task
  on task.organization_id = stage.organization_id
 and task.project_id = stage.project_id
 and task.project_stage_id = stage.id
group by stage.organization_id, stage.project_id, stage.id;

create view public.project_progress
with (security_invoker = true)
as
select
  project.organization_id,
  project.id as project_id,
  count(task.id) filter (where task.status <> 'cancelled')::integer as eligible_tasks,
  count(task.id) filter (where task.status = 'done')::integer as completed_tasks,
  case
    when count(task.id) filter (where task.status <> 'cancelled') = 0 then 0
    else round(
      count(task.id) filter (where task.status = 'done') * 100.0
      / count(task.id) filter (where task.status <> 'cancelled')
    )::integer
  end as progress_percent
from public.projects project
left join public.project_tasks task
  on task.organization_id = project.organization_id
 and task.project_id = project.id
group by project.organization_id, project.id;

create or replace function public.create_project_stage(
  target_project_id uuid,
  target_name text,
  target_description text default null,
  target_responsible_user_id uuid default null,
  target_planned_start_date date default null,
  target_planned_end_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  saved_stage_id uuid;
  next_position bigint;
  clean_name text := btrim(target_name);
  clean_description text := nullif(btrim(target_description), '');
begin
  current_project := private.lock_operable_project(target_project_id);

  if clean_name is null or length(clean_name) = 0 or length(clean_name) > 200 then
    raise exception 'stage name must contain between 1 and 200 characters';
  end if;
  if clean_description is not null and length(clean_description) > 8000 then
    raise exception 'stage description is too long';
  end if;
  if target_planned_end_date is not null and target_planned_start_date is not null
     and target_planned_end_date < target_planned_start_date then
    raise exception 'stage deadline cannot precede its start date';
  end if;
  if target_responsible_user_id is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = current_project.organization_id
      and membership.user_id = target_responsible_user_id
      and membership.status = 'active'
  ) then
    raise exception 'stage responsible must be an active member of the organization';
  end if;

  select coalesce(max(stage.position)::bigint, 0) + 1 into next_position
  from public.project_stages stage
  where stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
    and stage.archived_at is null;

  if next_position > 2147483647 then
    raise exception 'stage position limit reached; reorder stages before creating another stage';
  end if;

  insert into public.project_stages (
    organization_id, project_id, name, description, position,
    responsible_user_id, planned_start_date, planned_end_date, created_by
  ) values (
    current_project.organization_id, current_project.id, clean_name,
    clean_description, next_position, target_responsible_user_id,
    target_planned_start_date, target_planned_end_date, auth.uid()
  ) returning id into saved_stage_id;

  perform private.append_project_event(
    current_project.organization_id, current_project.id, 'stage_created',
    'stage', saved_stage_id, 'Etapa criada',
    jsonb_strip_nulls(jsonb_build_object(
      'name', clean_name,
      'position', next_position,
      'responsible_user_id', target_responsible_user_id,
      'planned_start_date', target_planned_start_date,
      'planned_end_date', target_planned_end_date
    ))
  );
  return saved_stage_id;
end;
$$;

create or replace function public.update_project_stage(
  target_stage_id uuid,
  target_name text,
  target_description text,
  target_status text,
  target_responsible_user_id uuid,
  target_planned_start_date date,
  target_planned_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_stage public.project_stages%rowtype;
  target_project_id uuid;
  clean_name text := btrim(target_name);
  clean_description text := nullif(btrim(target_description), '');
  transition_allowed boolean;
begin
  if target_stage_id is null then raise exception 'stage id is required'; end if;
  select stage.project_id into target_project_id
  from public.project_stages stage where stage.id = target_stage_id;
  if not found then raise exception 'stage not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select stage.* into current_stage
  from public.project_stages stage
  where stage.id = target_stage_id
    and stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
  for update;
  if not found then raise exception 'stage not found or access denied'; end if;
  if current_stage.archived_at is not null then raise exception 'archived stages are immutable'; end if;

  if clean_name is null or length(clean_name) = 0 or length(clean_name) > 200 then
    raise exception 'stage name must contain between 1 and 200 characters';
  end if;
  if clean_description is not null and length(clean_description) > 8000 then
    raise exception 'stage description is too long';
  end if;
  if target_status is null
     or target_status not in ('pending', 'in_progress', 'completed', 'skipped') then
    raise exception 'invalid stage status';
  end if;
  if target_planned_end_date is not null and target_planned_start_date is not null
     and target_planned_end_date < target_planned_start_date then
    raise exception 'stage deadline cannot precede its start date';
  end if;
  if target_responsible_user_id is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = current_project.organization_id
      and membership.user_id = target_responsible_user_id
      and membership.status = 'active'
  ) then
    raise exception 'stage responsible must be an active member of the organization';
  end if;

  if current_stage.status is distinct from target_status then
    transition_allowed := case current_stage.status
      when 'pending' then target_status in ('in_progress', 'skipped')
      when 'in_progress' then target_status in ('pending', 'completed', 'skipped')
      when 'completed' then target_status = 'in_progress'
      when 'skipped' then target_status = 'pending'
      else false
    end;
    if not transition_allowed then
      raise exception 'invalid stage status transition from % to %', current_stage.status, target_status;
    end if;
  end if;

  if clean_name = current_stage.name
     and clean_description is not distinct from current_stage.description
     and target_status = current_stage.status
     and target_responsible_user_id is not distinct from current_stage.responsible_user_id
     and target_planned_start_date is not distinct from current_stage.planned_start_date
     and target_planned_end_date is not distinct from current_stage.planned_end_date then
    return current_stage.id;
  end if;

  update public.project_stages stage
  set name = clean_name,
      description = clean_description,
      status = target_status,
      responsible_user_id = target_responsible_user_id,
      planned_start_date = target_planned_start_date,
      planned_end_date = target_planned_end_date
  where stage.id = current_stage.id
    and stage.organization_id = current_stage.organization_id;

  perform private.append_project_event(
    current_stage.organization_id, current_stage.project_id, 'stage_updated',
    'stage', current_stage.id, 'Etapa alterada',
    jsonb_build_object(
      'from', jsonb_build_object(
        'name', current_stage.name,
        'status', current_stage.status,
        'responsible_user_id', current_stage.responsible_user_id,
        'planned_start_date', current_stage.planned_start_date,
        'planned_end_date', current_stage.planned_end_date
      ),
      'to', jsonb_build_object(
        'name', clean_name,
        'status', target_status,
        'responsible_user_id', target_responsible_user_id,
        'planned_start_date', target_planned_start_date,
        'planned_end_date', target_planned_end_date
      )
    )
  );
  return current_stage.id;
end;
$$;

create or replace function public.reorder_project_stages(
  target_project_id uuid,
  ordered_stage_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  active_count integer;
  distinct_count integer;
  scratch_position integer;
  desired_position integer := 0;
  desired_id uuid;
  current_position integer;
  occupant_id uuid;
begin
  if ordered_stage_ids is null then raise exception 'ordered stage ids are required'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select count(*)::integer into active_count
  from public.project_stages stage
  where stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
    and stage.archived_at is null;

  select count(distinct stage_id)::integer into distinct_count
  from unnest(ordered_stage_ids) stage_id;

  if cardinality(ordered_stage_ids) <> active_count
     or distinct_count <> active_count
     or exists (
       select stage.id
       from public.project_stages stage
       where stage.organization_id = current_project.organization_id
         and stage.project_id = current_project.id
         and stage.archived_at is null
       except
       select unnest(ordered_stage_ids)
     ) then
    raise exception 'ordered stages must contain every active project stage exactly once';
  end if;

  select candidate::integer into scratch_position
  from generate_series(1, active_count + 1) candidate
  where not exists (
    select 1 from public.project_stages stage
    where stage.organization_id = current_project.organization_id
      and stage.project_id = current_project.id
      and stage.archived_at is null
      and stage.position = candidate
  )
  order by candidate
  limit 1;

  foreach desired_id in array ordered_stage_ids loop
    desired_position := desired_position + 1;
    select stage.position into current_position
    from public.project_stages stage
    where stage.organization_id = current_project.organization_id
      and stage.project_id = current_project.id
      and stage.id = desired_id;

    if current_position <> desired_position then
      occupant_id := null;
      select stage.id into occupant_id
      from public.project_stages stage
      where stage.organization_id = current_project.organization_id
        and stage.project_id = current_project.id
        and stage.archived_at is null
        and stage.position = desired_position;

      if occupant_id is not null then
        update public.project_stages set position = scratch_position where id = occupant_id;
      end if;
      update public.project_stages set position = desired_position where id = desired_id;
      if occupant_id is not null then
        update public.project_stages set position = current_position where id = occupant_id;
      end if;
    end if;
  end loop;

  perform private.append_project_event(
    current_project.organization_id, current_project.id, 'stage_reordered',
    'project', current_project.id, 'Etapas reordenadas',
    jsonb_build_object('ordered_stage_ids', to_jsonb(ordered_stage_ids))
  );
  return current_project.id;
end;
$$;

create or replace function public.archive_project_stage(target_stage_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_stage public.project_stages%rowtype;
  target_project_id uuid;
  active_count integer;
  ordered_stage_ids uuid[];
  scratch_position integer;
  desired_position integer := 0;
  desired_id uuid;
  current_position integer;
  occupant_id uuid;
begin
  if target_stage_id is null then raise exception 'stage id is required'; end if;
  select stage.project_id into target_project_id
  from public.project_stages stage where stage.id = target_stage_id;
  if not found then raise exception 'stage not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select stage.* into current_stage
  from public.project_stages stage
  where stage.id = target_stage_id
    and stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
  for update;
  if not found then raise exception 'stage not found or access denied'; end if;
  if current_stage.archived_at is not null then return current_stage.id; end if;

  if exists (
    select 1 from public.project_tasks task
    where task.organization_id = current_stage.organization_id
      and task.project_id = current_stage.project_id
      and task.project_stage_id = current_stage.id
      and task.status not in ('done', 'cancelled')
  ) then
    raise exception 'stage cannot be archived while it has pending tasks';
  end if;

  update public.project_stages stage
  set archived_at = statement_timestamp(), archived_by = auth.uid()
  where stage.id = current_stage.id
    and stage.organization_id = current_stage.organization_id;

  select count(*)::integer, array_agg(stage.id order by stage.position, stage.id)
    into active_count, ordered_stage_ids
  from public.project_stages stage
  where stage.organization_id = current_stage.organization_id
    and stage.project_id = current_stage.project_id
    and stage.archived_at is null;

  if active_count > 0 then
    select candidate::integer into scratch_position
    from generate_series(1, active_count + 1) candidate
    where not exists (
      select 1 from public.project_stages stage
      where stage.organization_id = current_stage.organization_id
        and stage.project_id = current_stage.project_id
        and stage.archived_at is null
        and stage.position = candidate
    )
    order by candidate
    limit 1;

    foreach desired_id in array ordered_stage_ids loop
      desired_position := desired_position + 1;
      select position into current_position from public.project_stages where id = desired_id;
      if current_position <> desired_position then
        occupant_id := null;
        select stage.id into occupant_id
        from public.project_stages stage
        where stage.organization_id = current_stage.organization_id
          and stage.project_id = current_stage.project_id
          and stage.archived_at is null
          and stage.position = desired_position;
        if occupant_id is not null then
          update public.project_stages set position = scratch_position where id = occupant_id;
        end if;
        update public.project_stages set position = desired_position where id = desired_id;
        if occupant_id is not null then
          update public.project_stages set position = current_position where id = occupant_id;
        end if;
      end if;
    end loop;
  end if;

  perform private.append_project_event(
    current_stage.organization_id, current_stage.project_id, 'stage_archived',
    'stage', current_stage.id, 'Etapa arquivada',
    jsonb_build_object('name', current_stage.name, 'position', current_stage.position)
  );
  return current_stage.id;
end;
$$;

create or replace function public.create_project_task(
  target_stage_id uuid,
  target_title text,
  target_description text default null,
  target_priority text default 'medium',
  target_assigned_to uuid default null,
  target_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_stage public.project_stages%rowtype;
  target_project_id uuid;
  saved_task_id uuid;
  next_position bigint;
  clean_title text := btrim(target_title);
  clean_description text := nullif(btrim(target_description), '');
begin
  if target_stage_id is null then raise exception 'stage id is required'; end if;
  select stage.project_id into target_project_id
  from public.project_stages stage where stage.id = target_stage_id;
  if not found then raise exception 'stage not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select stage.* into current_stage
  from public.project_stages stage
  where stage.id = target_stage_id
    and stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
  for update;
  if not found then raise exception 'stage not found or access denied'; end if;
  if current_stage.archived_at is not null then raise exception 'archived stages are immutable'; end if;

  if clean_title is null or length(clean_title) = 0 or length(clean_title) > 300 then
    raise exception 'task title must contain between 1 and 300 characters';
  end if;
  if clean_description is not null and length(clean_description) > 8000 then
    raise exception 'task description is too long';
  end if;
  if target_priority is null
     or target_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'invalid task priority';
  end if;
  if target_assigned_to is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = current_project.organization_id
      and membership.user_id = target_assigned_to
      and membership.status = 'active'
  ) then
    raise exception 'task assignee must be an active member of the organization';
  end if;

  select coalesce(max(task.position)::bigint, 0) + 1 into next_position
  from public.project_tasks task
  where task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and task.project_stage_id = current_stage.id;

  if next_position > 2147483647 then
    raise exception 'task position limit reached; reorder tasks before creating another task';
  end if;

  insert into public.project_tasks (
    organization_id, project_id, project_stage_id, title, description,
    position, priority, assigned_to, due_date, created_by
  ) values (
    current_project.organization_id, current_project.id, current_stage.id,
    clean_title, clean_description, next_position, target_priority,
    target_assigned_to, target_due_date, auth.uid()
  ) returning id into saved_task_id;

  perform private.append_project_event(
    current_project.organization_id, current_project.id, 'task_created',
    'task', saved_task_id, 'Tarefa criada',
    jsonb_strip_nulls(jsonb_build_object(
      'stage_id', current_stage.id, 'title', clean_title,
      'position', next_position, 'priority', target_priority,
      'assigned_to', target_assigned_to, 'due_date', target_due_date
    ))
  );
  return saved_task_id;
end;
$$;

create or replace function public.update_project_task(
  target_task_id uuid,
  target_title text,
  target_description text,
  target_priority text,
  target_assigned_to uuid,
  target_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
  clean_title text := btrim(target_title);
  clean_description text := nullif(btrim(target_description), '');
  general_changed boolean;
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;

  if clean_title is null or length(clean_title) = 0 or length(clean_title) > 300 then
    raise exception 'task title must contain between 1 and 300 characters';
  end if;
  if clean_description is not null and length(clean_description) > 8000 then
    raise exception 'task description is too long';
  end if;
  if target_priority is null
     or target_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'invalid task priority';
  end if;
  if target_assigned_to is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = current_project.organization_id
      and membership.user_id = target_assigned_to
      and membership.status = 'active'
  ) then
    raise exception 'task assignee must be an active member of the organization';
  end if;

  general_changed := clean_title is distinct from current_task.title
    or clean_description is distinct from current_task.description
    or target_priority is distinct from current_task.priority;

  if not general_changed
     and target_assigned_to is not distinct from current_task.assigned_to
     and target_due_date is not distinct from current_task.due_date then
    return current_task.id;
  end if;

  update public.project_tasks task
  set title = clean_title,
      description = clean_description,
      priority = target_priority,
      assigned_to = target_assigned_to,
      due_date = target_due_date
  where task.id = current_task.id
    and task.organization_id = current_task.organization_id;

  if general_changed then
    perform private.append_project_event(
      current_task.organization_id, current_task.project_id, 'task_updated',
      'task', current_task.id, 'Tarefa alterada',
      jsonb_build_object(
        'from', jsonb_build_object(
          'title', current_task.title, 'description', current_task.description,
          'priority', current_task.priority
        ),
        'to', jsonb_build_object(
          'title', clean_title, 'description', clean_description,
          'priority', target_priority
        )
      )
    );
  end if;

  if target_assigned_to is distinct from current_task.assigned_to then
    perform private.append_project_event(
      current_task.organization_id, current_task.project_id, 'task_assignee_changed',
      'task', current_task.id, 'Responsável da tarefa alterado',
      jsonb_build_object('from', current_task.assigned_to, 'to', target_assigned_to)
    );
  end if;

  if target_due_date is distinct from current_task.due_date then
    perform private.append_project_event(
      current_task.organization_id, current_task.project_id, 'task_deadline_changed',
      'task', current_task.id, 'Prazo da tarefa alterado',
      jsonb_build_object('from', current_task.due_date, 'to', target_due_date)
    );
  end if;

  return current_task.id;
end;
$$;

create or replace function public.change_project_task_status(
  target_task_id uuid,
  target_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
  transition_allowed boolean;
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  if target_status is null then raise exception 'task status is required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status = target_status then return current_task.id; end if;
  if target_status = 'done' then
    raise exception 'use complete_project_task to complete a task';
  end if;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'invalid task status transition from % to %', current_task.status, target_status;
  end if;

  transition_allowed := case current_task.status
    when 'todo' then target_status in ('in_progress', 'blocked', 'cancelled')
    when 'in_progress' then target_status in ('todo', 'blocked', 'cancelled')
    when 'blocked' then target_status in ('todo', 'in_progress', 'cancelled')
    else false
  end;
  if not transition_allowed then
    raise exception 'invalid task status transition from % to %', current_task.status, target_status;
  end if;

  update public.project_tasks task set status = target_status
  where task.id = current_task.id and task.organization_id = current_task.organization_id;

  perform private.append_project_event(
    current_task.organization_id, current_task.project_id, 'task_status_changed',
    'task', current_task.id, 'Situação da tarefa alterada',
    jsonb_build_object('from', current_task.status, 'to', target_status)
  );
  return current_task.id;
end;
$$;

create or replace function public.complete_project_task(target_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status = 'done' then return current_task.id; end if;
  if current_task.status = 'cancelled' then raise exception 'cancelled tasks cannot be completed'; end if;

  if exists (
    select 1 from public.project_task_checklist_items item
    where item.organization_id = current_task.organization_id
      and item.project_id = current_task.project_id
      and item.task_id = current_task.id
      and item.archived_at is null
      and not item.is_completed
  ) then
    raise exception 'task cannot be completed while it has pending checklist items';
  end if;

  update public.project_tasks task set status = 'done', completed_at = statement_timestamp()
  where task.id = current_task.id and task.organization_id = current_task.organization_id;

  perform private.append_project_event(
    current_task.organization_id, current_task.project_id, 'task_completed',
    'task', current_task.id, 'Tarefa concluída',
    jsonb_build_object('from', current_task.status, 'to', 'done')
  );
  return current_task.id;
end;
$$;

create or replace function public.reopen_project_task(target_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status <> 'done' then raise exception 'only completed tasks can be reopened'; end if;

  update public.project_tasks task set status = 'todo', completed_at = null
  where task.id = current_task.id and task.organization_id = current_task.organization_id;

  perform private.append_project_event(
    current_task.organization_id, current_task.project_id, 'task_reopened',
    'task', current_task.id, 'Tarefa reaberta',
    jsonb_build_object('from', 'done', 'to', 'todo')
  );
  return current_task.id;
end;
$$;

create or replace function public.reorder_project_tasks(
  target_stage_id uuid,
  ordered_task_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_stage public.project_stages%rowtype;
  target_project_id uuid;
  task_count integer;
  distinct_count integer;
  scratch_position integer;
  desired_position integer := 0;
  desired_id uuid;
  current_position integer;
  occupant_id uuid;
begin
  if target_stage_id is null then raise exception 'stage id is required'; end if;
  if ordered_task_ids is null then raise exception 'ordered task ids are required'; end if;
  select stage.project_id into target_project_id
  from public.project_stages stage where stage.id = target_stage_id;
  if not found then raise exception 'stage not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select stage.* into current_stage
  from public.project_stages stage
  where stage.id = target_stage_id
    and stage.organization_id = current_project.organization_id
    and stage.project_id = current_project.id
  for update;
  if not found then raise exception 'stage not found or access denied'; end if;
  if current_stage.archived_at is not null then raise exception 'archived stages are immutable'; end if;

  select count(*)::integer into task_count
  from public.project_tasks task
  where task.organization_id = current_stage.organization_id
    and task.project_id = current_stage.project_id
    and task.project_stage_id = current_stage.id;
  select count(distinct task_id)::integer into distinct_count
  from unnest(ordered_task_ids) task_id;

  if cardinality(ordered_task_ids) <> task_count
     or distinct_count <> task_count
     or exists (
       select task.id
       from public.project_tasks task
       where task.organization_id = current_stage.organization_id
         and task.project_id = current_stage.project_id
         and task.project_stage_id = current_stage.id
       except
       select unnest(ordered_task_ids)
     ) then
    raise exception 'ordered tasks must contain every stage task exactly once';
  end if;

  select candidate::integer into scratch_position
  from generate_series(1, task_count + 1) candidate
  where not exists (
    select 1 from public.project_tasks task
    where task.organization_id = current_stage.organization_id
      and task.project_id = current_stage.project_id
      and task.project_stage_id = current_stage.id
      and task.position = candidate
  )
  order by candidate
  limit 1;

  foreach desired_id in array ordered_task_ids loop
    desired_position := desired_position + 1;
    select task.position into current_position
    from public.project_tasks task
    where task.organization_id = current_stage.organization_id
      and task.project_id = current_stage.project_id
      and task.project_stage_id = current_stage.id
      and task.id = desired_id;

    if current_position <> desired_position then
      occupant_id := null;
      select task.id into occupant_id
      from public.project_tasks task
      where task.organization_id = current_stage.organization_id
        and task.project_id = current_stage.project_id
        and task.project_stage_id = current_stage.id
        and task.position = desired_position;

      if occupant_id is not null then
        update public.project_tasks set position = scratch_position where id = occupant_id;
      end if;
      update public.project_tasks set position = desired_position where id = desired_id;
      if occupant_id is not null then
        update public.project_tasks set position = current_position where id = occupant_id;
      end if;
    end if;
  end loop;

  perform private.append_project_event(
    current_stage.organization_id, current_stage.project_id, 'task_reordered',
    'stage', current_stage.id, 'Tarefas reordenadas',
    jsonb_build_object('ordered_task_ids', to_jsonb(ordered_task_ids))
  );
  return current_stage.id;
end;
$$;

create or replace function public.create_project_task_checklist_item(
  target_task_id uuid,
  target_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
  saved_item_id uuid;
  next_position bigint;
  clean_title text := btrim(target_title);
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;
  if clean_title is null or length(clean_title) = 0 or length(clean_title) > 500 then
    raise exception 'checklist item title must contain between 1 and 500 characters';
  end if;

  select coalesce(max(item.position)::bigint, 0) + 1 into next_position
  from public.project_task_checklist_items item
  where item.organization_id = current_task.organization_id
    and item.project_id = current_task.project_id
    and item.task_id = current_task.id
    and item.archived_at is null;

  if next_position > 2147483647 then
    raise exception 'checklist position limit reached; reorder items before creating another item';
  end if;

  insert into public.project_task_checklist_items (
    organization_id, project_id, task_id, title, position, created_by
  ) values (
    current_task.organization_id, current_task.project_id, current_task.id,
    clean_title, next_position, auth.uid()
  ) returning id into saved_item_id;

  perform private.append_project_event(
    current_task.organization_id, current_task.project_id, 'checklist_item_created',
    'checklist_item', saved_item_id, 'Item de checklist criado',
    jsonb_build_object('task_id', current_task.id, 'title', clean_title, 'position', next_position)
  );
  return saved_item_id;
end;
$$;

create or replace function public.update_project_task_checklist_item(
  target_item_id uuid,
  target_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  current_item public.project_task_checklist_items%rowtype;
  target_project_id uuid;
  clean_title text := btrim(target_title);
begin
  if target_item_id is null then raise exception 'checklist item id is required'; end if;
  select item.project_id into target_project_id
  from public.project_task_checklist_items item where item.id = target_item_id;
  if not found then raise exception 'checklist item not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select item.* into current_item
  from public.project_task_checklist_items item
  join public.project_tasks task
    on task.organization_id = item.organization_id
   and task.project_id = item.project_id
   and task.id = item.task_id
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where item.id = target_item_id
    and item.organization_id = current_project.organization_id
    and item.project_id = current_project.id
    and item.archived_at is null
    and stage.archived_at is null
  for update of item;
  if not found then raise exception 'checklist item not found, access denied or archived'; end if;

  select task.* into current_task
  from public.project_tasks task where task.id = current_item.task_id;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;
  if clean_title is null or length(clean_title) = 0 or length(clean_title) > 500 then
    raise exception 'checklist item title must contain between 1 and 500 characters';
  end if;
  if clean_title = current_item.title then return current_item.id; end if;

  update public.project_task_checklist_items item set title = clean_title
  where item.id = current_item.id and item.organization_id = current_item.organization_id;

  perform private.append_project_event(
    current_item.organization_id, current_item.project_id, 'checklist_item_updated',
    'checklist_item', current_item.id, 'Item de checklist alterado',
    jsonb_build_object('task_id', current_item.task_id, 'from', current_item.title, 'to', clean_title)
  );
  return current_item.id;
end;
$$;

create or replace function public.set_project_task_checklist_item_completed(
  target_item_id uuid,
  target_completed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  current_item public.project_task_checklist_items%rowtype;
  target_project_id uuid;
begin
  if target_completed is null then raise exception 'checklist completion state is required'; end if;
  if target_item_id is null then raise exception 'checklist item id is required'; end if;
  select item.project_id into target_project_id
  from public.project_task_checklist_items item where item.id = target_item_id;
  if not found then raise exception 'checklist item not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select item.* into current_item
  from public.project_task_checklist_items item
  join public.project_tasks task
    on task.organization_id = item.organization_id
   and task.project_id = item.project_id
   and task.id = item.task_id
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where item.id = target_item_id
    and item.organization_id = current_project.organization_id
    and item.project_id = current_project.id
    and item.archived_at is null
    and stage.archived_at is null
  for update of item;
  if not found then raise exception 'checklist item not found, access denied or archived'; end if;

  select task.* into current_task
  from public.project_tasks task where task.id = current_item.task_id;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;
  if current_item.is_completed = target_completed then return current_item.id; end if;

  update public.project_task_checklist_items item
  set is_completed = target_completed,
      completed_at = case when target_completed then statement_timestamp() else null end,
      completed_by = case when target_completed then auth.uid() else null end
  where item.id = current_item.id and item.organization_id = current_item.organization_id;

  perform private.append_project_event(
    current_item.organization_id, current_item.project_id,
    case when target_completed then 'checklist_item_completed' else 'checklist_item_reopened' end,
    'checklist_item', current_item.id,
    case when target_completed then 'Item de checklist concluído' else 'Item de checklist reaberto' end,
    jsonb_build_object('task_id', current_item.task_id, 'completed', target_completed)
  );
  return current_item.id;
end;
$$;

create or replace function public.archive_project_task_checklist_item(target_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  current_item public.project_task_checklist_items%rowtype;
  target_project_id uuid;
  item_count integer;
  ordered_item_ids uuid[];
  scratch_position integer;
  desired_position integer := 0;
  desired_id uuid;
  current_position integer;
  occupant_id uuid;
begin
  if target_item_id is null then raise exception 'checklist item id is required'; end if;
  select item.project_id into target_project_id
  from public.project_task_checklist_items item where item.id = target_item_id;
  if not found then raise exception 'checklist item not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select item.* into current_item
  from public.project_task_checklist_items item
  join public.project_tasks task
    on task.organization_id = item.organization_id
   and task.project_id = item.project_id
   and task.id = item.task_id
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where item.id = target_item_id
    and item.organization_id = current_project.organization_id
    and item.project_id = current_project.id
    and stage.archived_at is null
  for update of item;
  if not found then raise exception 'checklist item not found or access denied'; end if;
  if current_item.archived_at is not null then return current_item.id; end if;

  select task.* into current_task
  from public.project_tasks task where task.id = current_item.task_id;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;

  update public.project_task_checklist_items item
  set archived_at = statement_timestamp(), archived_by = auth.uid()
  where item.id = current_item.id and item.organization_id = current_item.organization_id;

  select count(*)::integer, array_agg(item.id order by item.position, item.id)
    into item_count, ordered_item_ids
  from public.project_task_checklist_items item
  where item.organization_id = current_item.organization_id
    and item.project_id = current_item.project_id
    and item.task_id = current_item.task_id
    and item.archived_at is null;

  if item_count > 0 then
    select candidate::integer into scratch_position
    from generate_series(1, item_count + 1) candidate
    where not exists (
      select 1 from public.project_task_checklist_items item
      where item.organization_id = current_item.organization_id
        and item.project_id = current_item.project_id
        and item.task_id = current_item.task_id
        and item.archived_at is null
        and item.position = candidate
    )
    order by candidate
    limit 1;

    foreach desired_id in array ordered_item_ids loop
      desired_position := desired_position + 1;
      select position into current_position
      from public.project_task_checklist_items where id = desired_id;
      if current_position <> desired_position then
        occupant_id := null;
        select item.id into occupant_id
        from public.project_task_checklist_items item
        where item.organization_id = current_item.organization_id
          and item.project_id = current_item.project_id
          and item.task_id = current_item.task_id
          and item.archived_at is null
          and item.position = desired_position;
        if occupant_id is not null then
          update public.project_task_checklist_items set position = scratch_position where id = occupant_id;
        end if;
        update public.project_task_checklist_items set position = desired_position where id = desired_id;
        if occupant_id is not null then
          update public.project_task_checklist_items set position = current_position where id = occupant_id;
        end if;
      end if;
    end loop;
  end if;

  perform private.append_project_event(
    current_item.organization_id, current_item.project_id, 'checklist_item_archived',
    'checklist_item', current_item.id, 'Item de checklist arquivado',
    jsonb_build_object('task_id', current_item.task_id, 'title', current_item.title)
  );
  return current_item.id;
end;
$$;

create or replace function public.reorder_project_task_checklist(
  target_task_id uuid,
  ordered_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project public.projects%rowtype;
  current_task public.project_tasks%rowtype;
  target_project_id uuid;
  item_count integer;
  distinct_count integer;
  scratch_position integer;
  desired_position integer := 0;
  desired_id uuid;
  current_position integer;
  occupant_id uuid;
begin
  if target_task_id is null then raise exception 'task id is required'; end if;
  if ordered_item_ids is null then raise exception 'ordered checklist item ids are required'; end if;
  select task.project_id into target_project_id
  from public.project_tasks task where task.id = target_task_id;
  if not found then raise exception 'task not found or access denied'; end if;
  current_project := private.lock_operable_project(target_project_id);

  select task.* into current_task
  from public.project_tasks task
  join public.project_stages stage
    on stage.organization_id = task.organization_id
   and stage.project_id = task.project_id
   and stage.id = task.project_stage_id
  where task.id = target_task_id
    and task.organization_id = current_project.organization_id
    and task.project_id = current_project.id
    and stage.archived_at is null
  for update of task;
  if not found then raise exception 'task not found, access denied or stage archived'; end if;
  if current_task.status in ('done', 'cancelled') then
    raise exception 'completed or cancelled tasks are immutable';
  end if;

  select count(*)::integer into item_count
  from public.project_task_checklist_items item
  where item.organization_id = current_task.organization_id
    and item.project_id = current_task.project_id
    and item.task_id = current_task.id
    and item.archived_at is null;
  select count(distinct item_id)::integer into distinct_count
  from unnest(ordered_item_ids) item_id;

  if cardinality(ordered_item_ids) <> item_count
     or distinct_count <> item_count
     or exists (
       select item.id
       from public.project_task_checklist_items item
       where item.organization_id = current_task.organization_id
         and item.project_id = current_task.project_id
         and item.task_id = current_task.id
         and item.archived_at is null
       except
       select unnest(ordered_item_ids)
     ) then
    raise exception 'ordered checklist items must contain every active task item exactly once';
  end if;

  select candidate::integer into scratch_position
  from generate_series(1, item_count + 1) candidate
  where not exists (
    select 1 from public.project_task_checklist_items item
    where item.organization_id = current_task.organization_id
      and item.project_id = current_task.project_id
      and item.task_id = current_task.id
      and item.archived_at is null
      and item.position = candidate
  )
  order by candidate
  limit 1;

  foreach desired_id in array ordered_item_ids loop
    desired_position := desired_position + 1;
    select item.position into current_position
    from public.project_task_checklist_items item
    where item.organization_id = current_task.organization_id
      and item.project_id = current_task.project_id
      and item.task_id = current_task.id
      and item.id = desired_id;

    if current_position <> desired_position then
      occupant_id := null;
      select item.id into occupant_id
      from public.project_task_checklist_items item
      where item.organization_id = current_task.organization_id
        and item.project_id = current_task.project_id
        and item.task_id = current_task.id
        and item.archived_at is null
        and item.position = desired_position;

      if occupant_id is not null then
        update public.project_task_checklist_items set position = scratch_position where id = occupant_id;
      end if;
      update public.project_task_checklist_items set position = desired_position where id = desired_id;
      if occupant_id is not null then
        update public.project_task_checklist_items set position = current_position where id = occupant_id;
      end if;
    end if;
  end loop;

  perform private.append_project_event(
    current_task.organization_id, current_task.project_id, 'checklist_reordered',
    'task', current_task.id, 'Checklist reordenado',
    jsonb_build_object('ordered_item_ids', to_jsonb(ordered_item_ids))
  );
  return current_task.id;
end;
$$;

-- Preserva a API da migration 009 e acrescenta apenas a validacao de tarefas pendentes.
create or replace function public.change_project_status(
  target_project_id uuid,
  target_status text,
  target_justification text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project record;
  clean_justification text := nullif(btrim(target_justification), '');
begin
  if target_project_id is null then raise exception 'project id is required'; end if;
  if target_status is null then raise exception 'project status is required'; end if;
  select project.* into current_project
  from public.projects project
  where project.id = target_project_id
    and private.is_active_org_member(project.organization_id)
  for update;
  if not found then raise exception 'project not found or access denied'; end if;
  if current_project.status = target_status then return current_project.id; end if;
  if target_status in ('paused', 'awaiting_client') and clean_justification is null then
    raise exception 'status justification is required';
  end if;
  if target_status = 'completed' and exists (
    select 1 from public.project_tasks task
    where task.organization_id = current_project.organization_id
      and task.project_id = current_project.id
      and task.status not in ('done', 'cancelled')
  ) then
    raise exception 'project cannot be completed with pending tasks';
  end if;

  update public.projects project
  set status = target_status
  where project.organization_id = current_project.organization_id
    and project.id = current_project.id;

  insert into public.project_events (
    organization_id, project_id, event_type, actor_user_id,
    description, event_data, justification
  ) values (
    current_project.organization_id,
    current_project.id,
    case target_status when 'completed' then 'completed' when 'cancelled' then 'cancelled' else 'status_changed' end,
    auth.uid(),
    'Situação alterada de ' || current_project.status || ' para ' || target_status,
    jsonb_build_object('from', current_project.status, 'to', target_status),
    clean_justification
  );
  return current_project.id;
end;
$$;

alter table public.project_task_checklist_items enable row level security;

drop policy project_stages_insert_active_members on public.project_stages;
drop policy project_stages_update_active_members on public.project_stages;
drop policy project_stages_delete_admins on public.project_stages;
drop policy project_tasks_insert_active_members on public.project_tasks;
drop policy project_tasks_update_active_members on public.project_tasks;
drop policy project_tasks_delete_admins on public.project_tasks;

create policy project_task_checklist_items_select_active_members
  on public.project_task_checklist_items for select to authenticated
  using (private.is_active_org_member(organization_id));

revoke all on table public.project_stages from public, anon, authenticated;
revoke all on table public.project_tasks from public, anon, authenticated;
revoke all on table public.project_task_checklist_items from public, anon, authenticated;
revoke all on table public.project_stage_progress from public, anon, authenticated;
revoke all on table public.project_progress from public, anon, authenticated;

grant select on table public.project_stages to authenticated;
grant select on table public.project_tasks to authenticated;
grant select on table public.project_task_checklist_items to authenticated;
grant select on table public.project_stage_progress to authenticated;
grant select on table public.project_progress to authenticated;

revoke all on function private.prepare_project_event_subject() from public, anon, authenticated;
revoke all on function private.append_project_event(uuid, uuid, text, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function private.lock_operable_project(uuid) from public, anon, authenticated;
revoke all on function private.guard_project_child_mutation() from public, anon, authenticated;
revoke all on function private.sync_project_task_state() from public, anon, authenticated;
revoke all on function private.sync_project_checklist_item_state() from public, anon, authenticated;

revoke all on function public.create_project_stage(uuid, text, text, uuid, date, date) from public, anon, authenticated;
revoke all on function public.update_project_stage(uuid, text, text, text, uuid, date, date) from public, anon, authenticated;
revoke all on function public.reorder_project_stages(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.archive_project_stage(uuid) from public, anon, authenticated;
revoke all on function public.create_project_task(uuid, text, text, text, uuid, date) from public, anon, authenticated;
revoke all on function public.update_project_task(uuid, text, text, text, uuid, date) from public, anon, authenticated;
revoke all on function public.change_project_task_status(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_project_task(uuid) from public, anon, authenticated;
revoke all on function public.reopen_project_task(uuid) from public, anon, authenticated;
revoke all on function public.reorder_project_tasks(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.create_project_task_checklist_item(uuid, text) from public, anon, authenticated;
revoke all on function public.update_project_task_checklist_item(uuid, text) from public, anon, authenticated;
revoke all on function public.set_project_task_checklist_item_completed(uuid, boolean) from public, anon, authenticated;
revoke all on function public.archive_project_task_checklist_item(uuid) from public, anon, authenticated;
revoke all on function public.reorder_project_task_checklist(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.change_project_status(uuid, text, text) from public, anon, authenticated;

grant execute on function public.create_project_stage(uuid, text, text, uuid, date, date) to authenticated;
grant execute on function public.update_project_stage(uuid, text, text, text, uuid, date, date) to authenticated;
grant execute on function public.reorder_project_stages(uuid, uuid[]) to authenticated;
grant execute on function public.archive_project_stage(uuid) to authenticated;
grant execute on function public.create_project_task(uuid, text, text, text, uuid, date) to authenticated;
grant execute on function public.update_project_task(uuid, text, text, text, uuid, date) to authenticated;
grant execute on function public.change_project_task_status(uuid, text) to authenticated;
grant execute on function public.complete_project_task(uuid) to authenticated;
grant execute on function public.reopen_project_task(uuid) to authenticated;
grant execute on function public.reorder_project_tasks(uuid, uuid[]) to authenticated;
grant execute on function public.create_project_task_checklist_item(uuid, text) to authenticated;
grant execute on function public.update_project_task_checklist_item(uuid, text) to authenticated;
grant execute on function public.set_project_task_checklist_item_completed(uuid, boolean) to authenticated;
grant execute on function public.archive_project_task_checklist_item(uuid) to authenticated;
grant execute on function public.reorder_project_task_checklist(uuid, uuid[]) to authenticated;
grant execute on function public.change_project_status(uuid, text, text) to authenticated;

comment on column public.project_stages.archived_at is
  'Arquivamento operacional sem exclusao; tarefas e historico permanecem preservados.';
comment on table public.project_task_checklist_items is
  'Checklist plano de tarefas, com conclusao e arquivamento auditados pelas RPCs da etapa 4C.2.';
comment on view public.project_progress is
  'Progresso dinamico por tarefas done sobre tarefas nao canceladas; zero quando nao ha elegiveis.';
comment on view public.project_stage_progress is
  'Progresso dinamico da etapa, incluindo etapas arquivadas para preservar o historico de execucao.';
comment on column public.project_events.subject_type is
  'Tipo da entidade do evento: project, stage, task ou checklist_item.';
comment on column public.project_events.subject_id is
  'Identificador da entidade auditada; eventos antigos apontam para o proprio projeto.';
comment on function public.change_project_status(uuid, text, text) is
  'Preserva as transicoes da migration 009 e impede concluir projeto com tarefas elegiveis pendentes.';

commit;
