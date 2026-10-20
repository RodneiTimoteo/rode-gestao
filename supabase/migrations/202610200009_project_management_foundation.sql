begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Etapa 4C.1: amplia a tabela existente sem criar um segundo domínio de projetos.
alter table public.projects
  drop constraint projects_status_valid,
  add column original_expected_end_date date,
  add column contracted_amount numeric(16,2),
  add column proposal_snapshot jsonb;

-- A trigger da migration 005 ainda conhece os códigos antigos durante o backfill.
alter table public.projects disable trigger projects_prepare;
update public.projects
set status = case status
  when 'active' then 'in_progress'
  when 'on_hold' then 'paused'
  else status
end;
alter table public.projects enable trigger projects_prepare;

update public.projects
set original_expected_end_date = expected_end_date
where original_expected_end_date is null;

update public.projects project
set contracted_amount = proposal.total_amount,
    proposal_snapshot = jsonb_build_object(
      'proposal_id', proposal.id,
      'code', proposal.code,
      'revision_group_id', proposal.revision_group_id,
      'revision_number', proposal.revision_number,
      'title', proposal.title,
      'proposal_format', proposal.proposal_format,
      'selected_option_id', proposal.selected_option_id,
      'selected_option', case
        when selected_option.id is null then null
        else jsonb_build_object(
          'id', selected_option.id,
          'name', selected_option.name,
          'description', selected_option.description,
          'total_amount', selected_option.total_amount
        )
      end,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'service_id', item.service_id,
            'option_id', item.option_id,
            'service_name', item.service_name_snapshot,
            'description', item.description,
            'quantity', item.quantity,
            'unit_price', item.unit_price,
            'discount_amount', item.discount_amount,
            'line_total', item.line_total
          ) order by item.option_id nulls first, item.position
        )
        from public.proposal_items item
        where item.organization_id = proposal.organization_id
          and item.proposal_id = proposal.id
          and (item.option_id is null or item.option_id = proposal.selected_option_id)
      ), '[]'::jsonb)
    )
from public.proposals proposal
left join public.proposal_options selected_option
  on selected_option.organization_id = proposal.organization_id
 and selected_option.proposal_id = proposal.id
 and selected_option.id = proposal.selected_option_id
where project.organization_id = proposal.organization_id
  and project.proposal_id = proposal.id
  and project.proposal_snapshot is null;

alter table public.projects
  add constraint projects_status_valid check (
    status in ('planning', 'in_progress', 'paused', 'awaiting_client', 'completed', 'cancelled')
  ),
  add constraint projects_contracted_amount_nonnegative check (
    contracted_amount is null or contracted_amount >= 0
  ),
  add constraint projects_proposal_snapshot_object check (
    proposal_snapshot is null or jsonb_typeof(proposal_snapshot) = 'object'
  );

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  description text not null,
  event_data jsonb not null default '{}'::jsonb,
  justification text,
  occurred_at timestamptz not null default now(),
  constraint project_events_type_valid check (
    event_type in (
      'created', 'created_from_proposal', 'status_changed',
      'owner_changed', 'deadline_changed', 'completed', 'cancelled'
    )
  ),
  constraint project_events_description_not_blank check (length(btrim(description)) > 0),
  constraint project_events_justification_not_blank check (
    justification is null or length(btrim(justification)) > 0
  ),
  constraint project_events_data_object check (jsonb_typeof(event_data) = 'object'),
  constraint project_events_project_same_org_fk foreign key (organization_id, project_id)
    references public.projects (organization_id, id) on delete cascade,
  constraint project_events_actor_member_fk foreign key (organization_id, actor_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index project_events_org_project_date_idx
  on public.project_events (organization_id, project_id, occurred_at desc, id desc);

create or replace function private.project_proposal_snapshot(
  target_organization_id uuid,
  target_proposal_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'proposal_id', proposal.id,
    'code', proposal.code,
    'revision_group_id', proposal.revision_group_id,
    'revision_number', proposal.revision_number,
    'title', proposal.title,
    'proposal_format', proposal.proposal_format,
    'selected_option_id', proposal.selected_option_id,
    'selected_option', case
      when selected_option.id is null then null
      else jsonb_build_object(
        'id', selected_option.id,
        'name', selected_option.name,
        'description', selected_option.description,
        'total_amount', selected_option.total_amount
      )
    end,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'service_id', item.service_id,
          'option_id', item.option_id,
          'service_name', item.service_name_snapshot,
          'description', item.description,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'discount_amount', item.discount_amount,
          'line_total', item.line_total
        ) order by item.option_id nulls first, item.position
      )
      from public.proposal_items item
      where item.organization_id = proposal.organization_id
        and item.proposal_id = proposal.id
        and (item.option_id is null or item.option_id = proposal.selected_option_id)
    ), '[]'::jsonb)
  )
  from public.proposals proposal
  left join public.proposal_options selected_option
    on selected_option.organization_id = proposal.organization_id
   and selected_option.proposal_id = proposal.id
   and selected_option.id = proposal.selected_option_id
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id;
$$;

create or replace function private.prepare_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_proposal record;
  transition_allowed boolean;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'project organization is immutable';
    end if;
    if new.client_id is distinct from old.client_id then
      raise exception 'project client is immutable';
    end if;
    if new.proposal_id is distinct from old.proposal_id then
      raise exception 'project proposal is immutable';
    end if;
  end if;

  if auth.uid() is not null and not private.is_active_org_member(new.organization_id) then
    raise exception 'project access denied' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.name := btrim(new.name);
    new.status := 'planning';
    new.completed_at := null;
    new.original_expected_end_date := new.expected_end_date;

    if new.proposal_id is not null then
      select proposal.status, proposal.total_amount
        into source_proposal
      from public.proposals proposal
      where proposal.organization_id = new.organization_id
        and proposal.id = new.proposal_id
        and proposal.client_id = new.client_id;
      if not found or source_proposal.status is distinct from 'approved' then
        raise exception 'projects can only be linked to an approved proposal from the same client';
      end if;
      new.contracted_amount := source_proposal.total_amount;
      new.proposal_snapshot := private.project_proposal_snapshot(new.organization_id, new.proposal_id);
    end if;
  else
    if new.original_expected_end_date is distinct from old.original_expected_end_date then
      raise exception 'original project deadline is immutable';
    end if;
    if new.contracted_amount is distinct from old.contracted_amount
       or new.proposal_snapshot is distinct from old.proposal_snapshot then
      raise exception 'project commercial snapshot is immutable';
    end if;
    if old.status in ('completed', 'cancelled')
       and to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
      raise exception 'terminal projects are immutable';
    end if;
    if new.status is distinct from old.status then
      transition_allowed := case old.status
        when 'planning' then new.status in ('in_progress', 'paused', 'awaiting_client', 'cancelled')
        when 'in_progress' then new.status in ('paused', 'awaiting_client', 'completed', 'cancelled')
        when 'paused' then new.status in ('in_progress', 'awaiting_client', 'cancelled')
        when 'awaiting_client' then new.status in ('in_progress', 'paused', 'cancelled')
        else false
      end;
      if not transition_allowed then
        raise exception 'invalid project status transition from % to %', old.status, new.status;
      end if;
      new.completed_at := case when new.status = 'completed' then statement_timestamp() else null end;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.record_project_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_events (
    organization_id, project_id, event_type, actor_user_id, description, event_data
  ) values (
    new.organization_id,
    new.id,
    case when new.proposal_id is null then 'created' else 'created_from_proposal' end,
    coalesce(auth.uid(), new.created_by),
    case when new.proposal_id is null then 'Projeto criado manualmente' else 'Projeto criado a partir de proposta aprovada' end,
    jsonb_strip_nulls(jsonb_build_object(
      'client_id', new.client_id,
      'proposal_id', new.proposal_id,
      'owner_user_id', new.owner_user_id,
      'original_expected_end_date', new.original_expected_end_date,
      'contracted_amount', new.contracted_amount
    ))
  );
  return null;
end;
$$;

create trigger projects_record_created after insert on public.projects
  for each row execute function private.record_project_created();

alter table public.project_events enable row level security;
revoke all on table public.project_events from public, anon, authenticated;
grant select on table public.project_events to authenticated;

create policy project_events_select_active_members
  on public.project_events for select to authenticated
  using (private.is_active_org_member(organization_id));

-- Campos auditáveis só podem ser alterados pelas RPCs abaixo. DELETE permanece
-- sem grant para authenticated, portanto usuários comuns não alcançam o CASCADE
-- de project_events. Os demais campos editáveis preservam a convenção existente.
revoke insert, update, delete on table public.projects from authenticated;
grant insert (
  id, organization_id, client_id, proposal_id, source_template_id, name, description,
  notes, priority, owner_user_id, start_date, expected_end_date, published_at,
  reference_url, published_url, created_by
) on table public.projects to authenticated;
grant update (
  name, description, notes, priority, start_date, published_at,
  reference_url, published_url
) on table public.projects to authenticated;

create or replace function public.create_manual_project(
  target_organization_id uuid,
  target_client_id uuid,
  target_name text,
  target_description text,
  target_owner_user_id uuid,
  target_start_date date,
  target_expected_end_date date,
  target_contracted_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_project_id uuid;
begin
  if not private.is_active_org_member(target_organization_id) then
    raise exception 'project access denied' using errcode = '42501';
  end if;
  if target_name is null or length(btrim(target_name)) = 0 then
    raise exception 'project name is required';
  end if;
  if target_contracted_amount is not null and target_contracted_amount < 0 then
    raise exception 'contracted amount must be nonnegative';
  end if;
  if target_expected_end_date is not null and target_start_date is not null
     and target_expected_end_date < target_start_date then
    raise exception 'project deadline cannot precede the start date';
  end if;
  if not exists (
    select 1 from public.clients client
    where client.organization_id = target_organization_id and client.id = target_client_id
  ) then
    raise exception 'client not found in organization';
  end if;
  if target_owner_user_id is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = target_owner_user_id
      and membership.status = 'active'
  ) then
    raise exception 'project owner must be an active member of the organization';
  end if;

  insert into public.projects (
    organization_id, client_id, name, description, owner_user_id,
    start_date, expected_end_date, contracted_amount, created_by
  ) values (
    target_organization_id, target_client_id, btrim(target_name),
    nullif(btrim(target_description), ''), target_owner_user_id,
    target_start_date, target_expected_end_date, target_contracted_amount, auth.uid()
  ) returning id into saved_project_id;

  return saved_project_id;
end;
$$;

create or replace function public.create_project_from_proposal(
  target_organization_id uuid,
  target_proposal_id uuid,
  target_name text,
  target_description text,
  target_owner_user_id uuid,
  target_start_date date,
  target_expected_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_proposal record;
  existing_project_id uuid;
  saved_project_id uuid;
begin
  if not private.is_active_org_member(target_organization_id) then
    raise exception 'project access denied' using errcode = '42501';
  end if;

  select proposal.* into source_proposal
  from public.proposals proposal
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id
  for update;
  if not found then raise exception 'proposal not found in organization'; end if;
  if source_proposal.status <> 'approved' then
    raise exception 'projects can only be created from approved proposals';
  end if;
  if source_proposal.proposal_format = 'options' and source_proposal.selected_option_id is null then
    raise exception 'approved options proposal must have a selected option';
  end if;

  select project.id into existing_project_id
  from public.projects project
  where project.organization_id = target_organization_id
    and project.proposal_id = target_proposal_id;
  if found then
    return jsonb_build_object('project_id', existing_project_id, 'created', false);
  end if;

  if target_owner_user_id is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = target_owner_user_id
      and membership.status = 'active'
  ) then
    raise exception 'project owner must be an active member of the organization';
  end if;
  if target_expected_end_date is not null and target_start_date is not null
     and target_expected_end_date < target_start_date then
    raise exception 'project deadline cannot precede the start date';
  end if;

  begin
    insert into public.projects (
      organization_id, client_id, proposal_id, name, description, owner_user_id,
      start_date, expected_end_date, contracted_amount, created_by
    ) values (
      target_organization_id, source_proposal.client_id, source_proposal.id,
      coalesce(nullif(btrim(target_name), ''), source_proposal.title),
      coalesce(nullif(btrim(target_description), ''), source_proposal.notes),
      target_owner_user_id, target_start_date, target_expected_end_date,
      source_proposal.total_amount, auth.uid()
    ) returning id into saved_project_id;
  exception when unique_violation then
    select project.id into existing_project_id
    from public.projects project
    where project.organization_id = target_organization_id
      and project.proposal_id = target_proposal_id;
    if existing_project_id is null then raise; end if;
    return jsonb_build_object('project_id', existing_project_id, 'created', false);
  end;

  return jsonb_build_object('project_id', saved_project_id, 'created', true);
end;
$$;

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

create or replace function public.assign_project_owner(
  target_project_id uuid,
  target_owner_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_project record;
begin
  select project.* into current_project
  from public.projects project
  where project.id = target_project_id
    and private.is_active_org_member(project.organization_id)
  for update;
  if not found then raise exception 'project not found or access denied'; end if;
  if current_project.status in ('completed', 'cancelled') then
    raise exception 'terminal projects are immutable';
  end if;
  if target_owner_user_id is not null and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = current_project.organization_id
      and membership.user_id = target_owner_user_id
      and membership.status = 'active'
  ) then
    raise exception 'project owner must be an active member of the organization';
  end if;
  if current_project.owner_user_id is not distinct from target_owner_user_id then
    return current_project.id;
  end if;

  update public.projects project
  set owner_user_id = target_owner_user_id
  where project.organization_id = current_project.organization_id
    and project.id = current_project.id;
  insert into public.project_events (
    organization_id, project_id, event_type, actor_user_id, description, event_data
  ) values (
    current_project.organization_id, current_project.id, 'owner_changed', auth.uid(),
    'Responsável principal alterado',
    jsonb_build_object('from', current_project.owner_user_id, 'to', target_owner_user_id)
  );
  return current_project.id;
end;
$$;

create or replace function public.change_project_deadline(
  target_project_id uuid,
  target_expected_end_date date,
  target_justification text
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
  if target_expected_end_date is null then raise exception 'new project deadline is required'; end if;
  if clean_justification is null then raise exception 'deadline justification is required'; end if;

  select project.* into current_project
  from public.projects project
  where project.id = target_project_id
    and private.is_active_org_member(project.organization_id)
  for update;
  if not found then raise exception 'project not found or access denied'; end if;
  if current_project.status in ('completed', 'cancelled') then
    raise exception 'terminal projects are immutable';
  end if;
  if current_project.start_date is not null and target_expected_end_date < current_project.start_date then
    raise exception 'project deadline cannot precede the start date';
  end if;
  if current_project.expected_end_date = target_expected_end_date then
    raise exception 'new project deadline must be different';
  end if;

  update public.projects project
  set expected_end_date = target_expected_end_date
  where project.organization_id = current_project.organization_id
    and project.id = current_project.id;
  insert into public.project_events (
    organization_id, project_id, event_type, actor_user_id,
    description, event_data, justification
  ) values (
    current_project.organization_id, current_project.id, 'deadline_changed', auth.uid(),
    'Prazo atual do projeto alterado',
    jsonb_build_object('from', current_project.expected_end_date, 'to', target_expected_end_date),
    clean_justification
  );
  return current_project.id;
end;
$$;

revoke all on function private.project_proposal_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.prepare_project() from public, anon, authenticated;
revoke all on function private.record_project_created() from public, anon, authenticated;
revoke all on function public.create_manual_project(uuid, uuid, text, text, uuid, date, date, numeric) from public, anon, authenticated;
revoke all on function public.create_project_from_proposal(uuid, uuid, text, text, uuid, date, date) from public, anon, authenticated;
revoke all on function public.change_project_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.assign_project_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.change_project_deadline(uuid, date, text) from public, anon, authenticated;

grant execute on function public.create_manual_project(uuid, uuid, text, text, uuid, date, date, numeric) to authenticated;
grant execute on function public.create_project_from_proposal(uuid, uuid, text, text, uuid, date, date) to authenticated;
grant execute on function public.change_project_status(uuid, text, text) to authenticated;
grant execute on function public.assign_project_owner(uuid, uuid) to authenticated;
grant execute on function public.change_project_deadline(uuid, date, text) to authenticated;

comment on column public.projects.original_expected_end_date is
  'Prazo informado na criação. Imutável; expected_end_date representa o prazo atual.';
comment on column public.projects.contracted_amount is
  'Valor contratado; em projetos de proposta é capturado do total aprovado.';
comment on column public.projects.proposal_snapshot is
  'Snapshot imutável da revisão aprovada, alternativa selecionada e itens contratados.';
comment on table public.project_events is
  'Histórico append-only de operações relevantes do projeto, isolado por organização.';
comment on function public.create_project_from_proposal(uuid, uuid, text, text, uuid, date, date) is
  'Cria no máximo um projeto por revisão aprovada e retorna o existente em concorrência.';
comment on function public.change_project_deadline(uuid, date, text) is
  'Altera prazo atual e registra justificativa de forma atômica, preservando o prazo original.';

commit;
