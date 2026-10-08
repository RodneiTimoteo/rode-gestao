-- VERSÃO REVISADA: ainda requer testes reais em PostgreSQL antes de produção.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text not null,
  tax_id text,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_status_valid check (status in ('active', 'suspended', 'inactive'))
);

create unique index organizations_slug_unique on public.organizations (lower(slug));
create unique index organizations_tax_id_unique
  on public.organizations (tax_id)
  where tax_id is not null and length(btrim(tax_id)) > 0;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (
    display_name is null or length(btrim(display_name)) > 0
  )
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  created_by uuid not null references auth.users(id) on delete restrict,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_org_user_unique unique (organization_id, user_id),
  constraint organization_members_role_valid check (role in ('owner', 'admin', 'member')),
  constraint organization_members_status_valid check (status in ('invited', 'active', 'suspended')),
  constraint organization_members_joined_at_valid check (
    status <> 'active' or joined_at is not null
  )
);

create index organization_members_user_status_idx
  on public.organization_members (user_id, status, organization_id);
create index organization_members_org_role_status_idx
  on public.organization_members (organization_id, role, status);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'company',
  name text not null,
  legal_name text,
  tax_id text,
  responsible_name text,
  contact_name text,
  email text,
  phone text,
  whatsapp text,
  segment text,
  city text,
  state text,
  country text not null default 'Brasil',
  source text,
  notes text,
  status text not null default 'lead',
  archived_at timestamptz,
  assigned_to uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_org_id_unique unique (organization_id, id),
  constraint clients_name_not_blank check (length(btrim(name)) > 0),
  constraint clients_kind_valid check (kind in ('company', 'person')),
  constraint clients_status_valid check (status in ('lead', 'active', 'inactive')),
  constraint clients_state_format check (state is null or state ~ '^[A-Z]{2}$'),
  constraint clients_assigned_member_fk foreign key (organization_id, assigned_to)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint clients_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index clients_org_name_idx on public.clients (organization_id, lower(name));
create index clients_org_status_idx on public.clients (organization_id, status);
create index clients_org_assigned_idx on public.clients (organization_id, assigned_to);
create index clients_org_email_idx on public.clients (organization_id, lower(email)) where email is not null;
create unique index clients_org_tax_id_unique
  on public.clients (organization_id, tax_id)
  where tax_id is not null and length(btrim(tax_id)) > 0;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  name text not null,
  position integer not null,
  outcome text not null default 'open',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipeline_stages_org_id_unique unique (organization_id, id),
  constraint pipeline_stages_org_key_unique unique (organization_id, key),
  constraint pipeline_stages_org_position_unique unique (organization_id, position),
  constraint pipeline_stages_key_format check (key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint pipeline_stages_name_not_blank check (length(btrim(name)) > 0),
  constraint pipeline_stages_position_positive check (position > 0),
  constraint pipeline_stages_outcome_valid check (outcome in ('open', 'won', 'lost'))
);

create index pipeline_stages_org_active_position_idx
  on public.pipeline_stages (organization_id, is_active, position);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  pipeline_stage_id uuid not null,
  owner_user_id uuid,
  title text not null,
  service_interest text,
  estimated_value numeric(14,2),
  expected_close_date date,
  outcome text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  lost_reason text,
  notes text,
  archived_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_org_id_unique unique (organization_id, id),
  constraint opportunities_org_id_client_unique unique (organization_id, id, client_id),
  constraint opportunities_title_not_blank check (length(btrim(title)) > 0),
  constraint opportunities_value_nonnegative check (estimated_value is null or estimated_value >= 0),
  constraint opportunities_outcome_valid check (outcome in ('open', 'won', 'lost')),
  constraint opportunities_closed_state_valid check (
    (outcome = 'open' and closed_at is null)
    or (outcome in ('won', 'lost') and closed_at is not null)
  ),
  constraint opportunities_lost_reason_valid check (
    outcome = 'lost' or lost_reason is null
  ),
  constraint opportunities_client_same_org_fk foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint opportunities_stage_same_org_fk foreign key (organization_id, pipeline_stage_id)
    references public.pipeline_stages (organization_id, id) on delete restrict,
  constraint opportunities_owner_member_fk foreign key (organization_id, owner_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint opportunities_creator_member_fk foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index opportunities_org_stage_idx
  on public.opportunities (organization_id, pipeline_stage_id);
create index opportunities_org_client_idx
  on public.opportunities (organization_id, client_id);
create index opportunities_org_owner_idx
  on public.opportunities (organization_id, owner_user_id);
create index opportunities_org_expected_close_idx
  on public.opportunities (organization_id, expected_close_date)
  where outcome = 'open';

create table public.client_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  opportunity_id uuid,
  activity_type text not null,
  description text not null,
  author_user_id uuid not null default auth.uid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_activities_type_valid check (
    activity_type in ('call', 'email', 'meeting', 'note', 'proposal', 'message', 'other')
  ),
  constraint client_activities_description_not_blank check (length(btrim(description)) > 0),
  constraint client_activities_client_same_org_fk foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint client_activities_opportunity_client_same_org_fk
    foreign key (organization_id, opportunity_id, client_id)
    references public.opportunities (organization_id, id, client_id) on delete restrict,
  constraint client_activities_author_member_fk foreign key (organization_id, author_user_id)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index client_activities_org_client_date_idx
  on public.client_activities (organization_id, client_id, occurred_at desc);
create index client_activities_org_opportunity_idx
  on public.client_activities (organization_id, opportunity_id)
  where opportunity_id is not null;
create index client_activities_org_author_idx
  on public.client_activities (organization_id, author_user_id);

-- Consistência do resultado comercial com a etapa selecionada.
-- A aplicação altera pipeline_stage_id; outcome e closed_at são derivados no banco.
create or replace function private.sync_opportunity_stage_outcome()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stage_outcome text;
begin
  select stage.outcome into stage_outcome
  from public.pipeline_stages stage
  where stage.id = new.pipeline_stage_id
    and stage.organization_id = new.organization_id
    and stage.is_active = true;
  if stage_outcome is null then
    raise exception 'A etapa selecionada não existe ou está inativa nesta organização';
  end if;
  new.outcome := stage_outcome;
  if stage_outcome = 'open' then
    new.closed_at := null;
    new.lost_reason := null;
  else
    if tg_op = 'INSERT' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif old.outcome = 'open' or old.outcome <> stage_outcome then
      new.closed_at := now();
    else
      new.closed_at := coalesce(new.closed_at, now());
    end if;
    if stage_outcome <> 'lost' then
      new.lost_reason := null;
    end if;
  end if;
  return new;
end;
$$;

-- Mudanças no resultado de uma etapa já utilizada exigem migração explícita,
-- evitando deixar oportunidades existentes com dados inconsistentes.
create or replace function private.prevent_used_stage_outcome_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.outcome is distinct from old.outcome
     and exists (select 1 from public.opportunities o
                 where o.organization_id = old.organization_id
                   and o.pipeline_stage_id = old.id) then
    raise exception 'Não altere o resultado de etapa com oportunidades vinculadas';
  end if;
  return new;
end;
$$;

create or replace function private.is_active_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members membership
      join public.organizations organization
        on organization.id = membership.organization_id
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and organization.status = 'active'
    );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members membership
      join public.organizations organization
        on organization.id = membership.organization_id
      where membership.organization_id = target_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role = any(allowed_roles)
        and organization.status = 'active'
    );
$$;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      target_user_id = (select auth.uid())
      or exists (
        select 1
        from public.organization_members viewer
        join public.organization_members target
          on target.organization_id = viewer.organization_id
        join public.organizations organization
          on organization.id = viewer.organization_id
        where viewer.user_id = (select auth.uid())
          and viewer.status = 'active'
          and target.user_id = target_user_id
          and target.status = 'active'
          and organization.status = 'active'
      )
    );
$$;

revoke all on function private.is_active_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, text[]) from public, anon, authenticated;
revoke all on function private.can_view_profile(uuid) from public, anon, authenticated;
grant execute on function private.is_active_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create or replace function private.prevent_organization_reassignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_membership_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.user_id is distinct from old.user_id
    or new.created_by is distinct from old.created_by then
    raise exception 'membership identity and creator cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_business_author_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'client_activities' then
    if (to_jsonb(new) ->> 'author_user_id') is distinct from (to_jsonb(old) ->> 'author_user_id') then
      raise exception 'activity author cannot be changed';
    end if;
  elsif (to_jsonb(new) ->> 'created_by') is distinct from (to_jsonb(old) ->> 'created_by') then
    raise exception 'record creator cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.assert_organization_has_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  if tg_table_name = 'organizations' then
    if tg_op = 'DELETE' then
      target_organization_id := old.id;
    else
      target_organization_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      target_organization_id := old.organization_id;
    else
      target_organization_id := new.organization_id;
    end if;
  end if;

  if exists (
    select 1 from public.organizations organization
    where organization.id = target_organization_id
  ) and not exists (
    select 1 from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'organization % must have at least one active owner', target_organization_id;
  end if;

  return null;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.prevent_organization_reassignment() from public, anon, authenticated;
revoke all on function private.prevent_membership_identity_change() from public, anon, authenticated;
revoke all on function private.prevent_business_author_change() from public, anon, authenticated;
revoke all on function private.assert_organization_has_active_owner() from public, anon, authenticated;

revoke all on function private.sync_opportunity_stage_outcome() from public, anon, authenticated;
revoke all on function private.prevent_used_stage_outcome_change() from public, anon, authenticated;

create trigger opportunities_sync_stage_outcome
  before insert or update on public.opportunities
  for each row execute function private.sync_opportunity_stage_outcome();
create trigger pipeline_stages_prevent_used_outcome_change
  before update on public.pipeline_stages
  for each row execute function private.prevent_used_stage_outcome_change();

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function private.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger pipeline_stages_set_updated_at before update on public.pipeline_stages
  for each row execute function private.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function private.set_updated_at();
create trigger client_activities_set_updated_at before update on public.client_activities
  for each row execute function private.set_updated_at();

create trigger organization_members_identity_immutable
  before update on public.organization_members
  for each row execute function private.prevent_membership_identity_change();

create trigger clients_organization_immutable before update on public.clients
  for each row execute function private.prevent_organization_reassignment();
create trigger pipeline_stages_organization_immutable before update on public.pipeline_stages
  for each row execute function private.prevent_organization_reassignment();
create trigger opportunities_organization_immutable before update on public.opportunities
  for each row execute function private.prevent_organization_reassignment();
create trigger client_activities_organization_immutable before update on public.client_activities
  for each row execute function private.prevent_organization_reassignment();

create trigger clients_creator_immutable before update on public.clients
  for each row execute function private.prevent_business_author_change();
create trigger opportunities_creator_immutable before update on public.opportunities
  for each row execute function private.prevent_business_author_change();
create trigger client_activities_author_immutable before update on public.client_activities
  for each row execute function private.prevent_business_author_change();

create constraint trigger organizations_require_active_owner
  after insert or update on public.organizations
  deferrable initially deferred
  for each row execute function private.assert_organization_has_active_owner();
create constraint trigger organization_members_require_active_owner
  after insert or update or delete on public.organization_members
  deferrable initially deferred
  for each row execute function private.assert_organization_has_active_owner();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.client_activities enable row level security;

revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.organization_members from public, anon, authenticated;
revoke all on table public.clients from public, anon, authenticated;
revoke all on table public.pipeline_stages from public, anon, authenticated;
revoke all on table public.opportunities from public, anon, authenticated;
revoke all on table public.client_activities from public, anon, authenticated;

grant select on table public.organizations to authenticated;
grant update (name, legal_name, slug, tax_id, email, phone)
  on table public.organizations to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.pipeline_stages to authenticated;
grant select, insert, update, delete on table public.opportunities to authenticated;
grant select, insert, update, delete on table public.client_activities to authenticated;

create policy organizations_select_active_members
  on public.organizations for select to authenticated
  using (private.is_active_org_member(id));

create policy organizations_update_admins
  on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']))
  with check (private.has_org_role(id, array['owner', 'admin']));

create policy profiles_select_shared_organization
  on public.profiles for select to authenticated
  using (private.can_view_profile(id));

create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) is not null and id = (select auth.uid()));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using ((select auth.uid()) is not null and id = (select auth.uid()))
  with check ((select auth.uid()) is not null and id = (select auth.uid()));

create policy organization_members_select_active_members
  on public.organization_members for select to authenticated
  using (private.is_active_org_member(organization_id));

create policy organization_members_insert_admins
  on public.organization_members for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and (
      role in ('admin', 'member')
      or (
        role = 'owner'
        and private.has_org_role(organization_id, array['owner'])
      )
    )
    and created_by = (select auth.uid())
  );

create policy organization_members_update_admins
  on public.organization_members for update to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and (
      private.has_org_role(organization_id, array['owner'])
      or role <> 'owner'
    )
  )
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    and (
      private.has_org_role(organization_id, array['owner'])
      or role <> 'owner'
    )
  );

create policy clients_select_active_members
  on public.clients for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy clients_insert_active_members
  on public.clients for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy clients_update_active_members
  on public.clients for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));
create policy clients_delete_admins
  on public.clients for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy pipeline_stages_select_active_members
  on public.pipeline_stages for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy pipeline_stages_insert_admins
  on public.pipeline_stages for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy pipeline_stages_update_admins
  on public.pipeline_stages for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy pipeline_stages_delete_admins
  on public.pipeline_stages for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy opportunities_select_active_members
  on public.opportunities for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy opportunities_insert_active_members
  on public.opportunities for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
  );
create policy opportunities_update_active_members
  on public.opportunities for update to authenticated
  using (private.is_active_org_member(organization_id))
  with check (private.is_active_org_member(organization_id));
create policy opportunities_delete_admins
  on public.opportunities for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy client_activities_select_active_members
  on public.client_activities for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy client_activities_insert_as_author
  on public.client_activities for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and author_user_id = (select auth.uid())
  );
create policy client_activities_update_author_or_admin
  on public.client_activities for update to authenticated
  using (
    private.is_active_org_member(organization_id)
    and (
      author_user_id = (select auth.uid())
      or private.has_org_role(organization_id, array['owner', 'admin'])
    )
  )
  with check (
    private.is_active_org_member(organization_id)
    and (
      author_user_id = (select auth.uid())
      or private.has_org_role(organization_id, array['owner', 'admin'])
    )
  );
create policy client_activities_delete_admins
  on public.client_activities for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

comment on schema private is 'Funções internas de autorização; não expor pela Data API.';
comment on table public.organization_members is 'Vínculos multiempresa. Alteração de organization_id e user_id é bloqueada por trigger.';
comment on column public.pipeline_stages.outcome is 'open para etapas intermediárias; won ou lost para etapas finais.';

commit;
