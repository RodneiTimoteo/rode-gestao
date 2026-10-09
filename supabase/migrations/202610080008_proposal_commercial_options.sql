begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- total_amount mantém o significado de valor contratado. Em propostas com
-- alternativas ele permanece NULL até a escolha; nunca representa a soma das opções.
alter table public.proposals
  add column proposal_format text not null default 'simple',
  add column selected_option_id uuid;

alter table public.proposals
  alter column subtotal_amount drop not null,
  alter column discount_amount drop not null,
  alter column total_amount drop not null,
  drop constraint proposals_amounts_nonnegative,
  drop constraint proposals_totals_consistent,
  add constraint proposals_format_valid
    check (proposal_format in ('simple', 'options')),
  add constraint proposals_financial_state_valid check (
    (
      proposal_format = 'simple'
      and selected_option_id is null
      and subtotal_amount is not null
      and discount_amount is not null
      and total_amount is not null
      and subtotal_amount >= 0
      and discount_amount >= 0
      and total_amount >= 0
      and total_amount = subtotal_amount - discount_amount
    )
    or
    (
      proposal_format = 'options'
      and (
        (
          selected_option_id is null
          and subtotal_amount is null
          and discount_amount is null
          and total_amount is null
        )
        or
        (
          selected_option_id is not null
          and subtotal_amount is not null
          and discount_amount is not null
          and total_amount is not null
          and subtotal_amount >= 0
          and discount_amount >= 0
          and total_amount >= 0
          and total_amount = subtotal_amount - discount_amount
        )
      )
    )
  ),
  add constraint proposals_options_approval_requires_selection check (
    proposal_format <> 'options' or status <> 'approved' or selected_option_id is not null
  );

create table public.proposal_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null,
  name text not null,
  description text,
  position integer not null,
  subtotal_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_options_org_proposal_id_unique
    unique (organization_id, proposal_id, id),
  constraint proposal_options_org_proposal_position_unique
    unique (organization_id, proposal_id, position),
  constraint proposal_options_name_not_blank check (length(btrim(name)) > 0),
  constraint proposal_options_position_range check (position between 1 and 3),
  constraint proposal_options_amounts_valid check (
    subtotal_amount >= 0
    and discount_amount >= 0
    and total_amount >= 0
    and total_amount = subtotal_amount - discount_amount
  ),
  constraint proposal_options_proposal_same_org_fk
    foreign key (organization_id, proposal_id)
    references public.proposals (organization_id, id) on delete cascade,
  constraint proposal_options_creator_member_fk
    foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create unique index proposal_options_org_proposal_name_unique
  on public.proposal_options (organization_id, proposal_id, lower(btrim(name)));
create index proposal_options_org_proposal_idx
  on public.proposal_options (organization_id, proposal_id, position);

alter table public.proposals
  add constraint proposals_selected_option_fk
  foreign key (selected_option_id)
  references public.proposal_options(id)
  deferrable initially deferred;

alter table public.proposal_items
  add column option_id uuid,
  drop constraint proposal_items_org_proposal_position_unique,
  add constraint proposal_items_option_same_proposal_fk
    foreign key (organization_id, proposal_id, option_id)
    references public.proposal_options (organization_id, proposal_id, id) on delete cascade;

create unique index proposal_items_common_position_unique
  on public.proposal_items (organization_id, proposal_id, position)
  where option_id is null;
create unique index proposal_items_option_position_unique
  on public.proposal_items (organization_id, proposal_id, option_id, position)
  where option_id is not null;
create index proposal_items_org_option_idx
  on public.proposal_items (organization_id, proposal_id, option_id)
  where option_id is not null;

alter table public.proposal_events
  drop constraint proposal_events_type_valid,
  add constraint proposal_events_type_valid check (
    event_type in (
      'created', 'status_changed', 'sent', 'approved', 'rejected',
      'cancelled', 'expired', 'revision_created', 'attachment_added',
      'attachment_replaced', 'option_selected', 'option_selection_changed', 'note'
    )
  );

create or replace function private.assert_proposal_option_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_format text;
  parent_status text;
begin
  select proposal.proposal_format, proposal.status
    into parent_format, parent_status
  from public.proposals proposal
  where proposal.organization_id = new.organization_id
    and proposal.id = new.proposal_id;

  if not found or parent_format <> 'options' then
    raise exception 'commercial options require an options proposal';
  end if;
  if parent_status <> 'draft' then
    raise exception 'proposal options can only be changed in draft proposals';
  end if;
  return new;
end;
$$;

create or replace function private.assert_proposal_item_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_format text;
  parent_status text;
begin
  select proposal.proposal_format, proposal.status
    into parent_format, parent_status
  from public.proposals proposal
  where proposal.organization_id = new.organization_id
    and proposal.id = new.proposal_id;

  if not found then
    raise exception 'proposal not found in organization';
  end if;
  if parent_status <> 'draft' then
    raise exception 'proposal items can only be changed in draft proposals';
  end if;
  if parent_format = 'simple' and new.option_id is not null then
    raise exception 'simple proposals cannot contain option items';
  end if;
  return new;
end;
$$;

-- Validação diferida permite substituir toda a estrutura dentro de uma única RPC,
-- mas impede que Data API ou transações diretas persistam propostas incompletas.
create or replace function private.enforce_proposal_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_proposal_id uuid;
  target_format text;
  option_count integer;
  common_count integer;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    if tg_table_name = 'proposals' then
      target_proposal_id := old.id;
    else
      target_proposal_id := (to_jsonb(old) ->> 'proposal_id')::uuid;
    end if;
  else
    target_organization_id := new.organization_id;
    if tg_table_name = 'proposals' then
      target_proposal_id := new.id;
    else
      target_proposal_id := (to_jsonb(new) ->> 'proposal_id')::uuid;
    end if;
  end if;

  select proposal.proposal_format into target_format
  from public.proposals proposal
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id;
  if not found then
    return null;
  end if;

  select count(*)::integer into option_count
  from public.proposal_options option_row
  where option_row.organization_id = target_organization_id
    and option_row.proposal_id = target_proposal_id;
  select count(*)::integer into common_count
  from public.proposal_items item
  where item.organization_id = target_organization_id
    and item.proposal_id = target_proposal_id
    and item.option_id is null;

  if target_format = 'simple' then
    if option_count <> 0 or common_count not between 1 and 100 then
      raise exception 'simple proposal must contain between 1 and 100 items and no options';
    end if;
  else
    if option_count not between 2 and 3 or common_count > 100 then
      raise exception 'options proposal must contain two or three options and at most 100 common items';
    end if;
    if exists (
      select 1
      from public.proposal_options option_row
      where option_row.organization_id = target_organization_id
        and option_row.proposal_id = target_proposal_id
        and (
          select count(*)
          from public.proposal_items item
          where item.organization_id = option_row.organization_id
            and item.proposal_id = option_row.proposal_id
            and item.option_id = option_row.id
        ) not between 1 and 100
    ) then
      raise exception 'each commercial option must contain between 1 and 100 exclusive items';
    end if;
  end if;
  return null;
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
  target_format text;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_proposal_id := old.proposal_id;
  else
    target_organization_id := new.organization_id;
    target_proposal_id := new.proposal_id;
  end if;

  select proposal.proposal_format into target_format
  from public.proposals proposal
  where proposal.organization_id = target_organization_id
    and proposal.id = target_proposal_id;
  if not found then return null; end if;

  if target_format = 'simple' then
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
        and item.option_id is null
    ) totals
    where proposal.organization_id = target_organization_id
      and proposal.id = target_proposal_id;
  else
    with option_totals as (
      select
        option_source.id,
        coalesce(round(sum(item.quantity * item.unit_price), 2), 0)::numeric(16,2) as subtotal_amount,
        coalesce(round(sum(item.discount_amount), 2), 0)::numeric(16,2) as discount_amount
      from public.proposal_options option_source
      left join public.proposal_items item
        on item.organization_id = option_source.organization_id
       and item.proposal_id = option_source.proposal_id
       and (item.option_id is null or item.option_id = option_source.id)
      where option_source.organization_id = target_organization_id
        and option_source.proposal_id = target_proposal_id
      group by option_source.id
    )
    update public.proposal_options option_row
    set subtotal_amount = totals.subtotal_amount,
        discount_amount = totals.discount_amount,
        total_amount = totals.subtotal_amount - totals.discount_amount,
        updated_at = statement_timestamp()
    from option_totals totals
    where option_row.organization_id = target_organization_id
      and option_row.proposal_id = target_proposal_id
      and option_row.id = totals.id;

    update public.proposals proposal
    set subtotal_amount = selected.subtotal_amount,
        discount_amount = selected.discount_amount,
        total_amount = selected.total_amount
    from public.proposal_options selected
    where proposal.organization_id = target_organization_id
      and proposal.id = target_proposal_id
      and proposal.selected_option_id = selected.id
      and selected.organization_id = proposal.organization_id
      and selected.proposal_id = proposal.id;

    update public.proposals proposal
    set subtotal_amount = null, discount_amount = null, total_amount = null
    where proposal.organization_id = target_organization_id
      and proposal.id = target_proposal_id
      and proposal.selected_option_id is null;
  end if;
  return null;
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
  chosen_option record;
begin
  if tg_op = 'INSERT' then
    if new.supersedes_proposal_id is null then
      new.revision_group_id := new.id;
      new.revision_number := 1;
    else
      select proposal.client_id, proposal.opportunity_id, proposal.revision_group_id,
             proposal.revision_number, proposal.proposal_format
        into previous_revision
      from public.proposals proposal
      where proposal.organization_id = new.organization_id
        and proposal.id = new.supersedes_proposal_id
      for update;
      if not found then raise exception 'superseded proposal not found in organization'; end if;
      new.client_id := previous_revision.client_id;
      new.opportunity_id := previous_revision.opportunity_id;
      new.revision_group_id := previous_revision.revision_group_id;
      new.revision_number := previous_revision.revision_number + 1;
      new.proposal_format := previous_revision.proposal_format;
    end if;

    new.proposal_number := private.next_document_number(new.organization_id, 'proposal');
    new.code := 'PROP-' || lpad(new.proposal_number::text, 6, '0');
    new.status := 'draft';
    new.selected_option_id := null;
    new.sent_at := null;
    new.approved_at := null;
    new.approved_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
    new.cancelled_at := null;
    if new.proposal_format = 'options' then
      new.subtotal_amount := null;
      new.discount_amount := null;
      new.total_amount := null;
    else
      new.proposal_format := 'simple';
      new.subtotal_amount := 0;
      new.discount_amount := 0;
      new.total_amount := 0;
    end if;
    return new;
  end if;

  if old.status in ('approved', 'rejected', 'expired', 'cancelled')
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'terminal proposals are immutable; create a revision';
  end if;

  if new.proposal_format = 'simple' then
    new.selected_option_id := null;
  elsif new.selected_option_id is distinct from old.selected_option_id then
    if old.status not in ('sent', 'negotiating') then
      raise exception 'commercial option can only be selected while proposal is sent or negotiating';
    end if;
    select option_row.id, option_row.name, option_row.subtotal_amount,
           option_row.discount_amount, option_row.total_amount
      into chosen_option
    from public.proposal_options option_row
    where option_row.organization_id = new.organization_id
      and option_row.proposal_id = new.id
      and option_row.id = new.selected_option_id;
    if not found then raise exception 'selected option does not belong to proposal'; end if;
    new.subtotal_amount := chosen_option.subtotal_amount;
    new.discount_amount := chosen_option.discount_amount;
    new.total_amount := chosen_option.total_amount;
  elsif new.selected_option_id is null then
    new.subtotal_amount := null;
    new.discount_amount := null;
    new.total_amount := null;
  else
    select option_row.id, option_row.name, option_row.subtotal_amount,
           option_row.discount_amount, option_row.total_amount
      into chosen_option
    from public.proposal_options option_row
    where option_row.organization_id = new.organization_id
      and option_row.proposal_id = new.id
      and option_row.id = new.selected_option_id;
    if not found then raise exception 'selected option does not belong to proposal'; end if;
    new.subtotal_amount := chosen_option.subtotal_amount;
    new.discount_amount := chosen_option.discount_amount;
    new.total_amount := chosen_option.total_amount;
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
      if not private.has_org_role(new.organization_id, array['owner', 'admin']) then
        raise exception 'only organization owners and admins can approve proposals' using errcode = '42501';
      end if;
      if new.proposal_format = 'options' and new.selected_option_id is null then
        raise exception 'an option must be selected before approving an options proposal';
      end if;
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

create or replace function private.record_proposal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_event_type text;
  actor_id uuid;
  selected_name text;
  previous_name text;
begin
  actor_id := coalesce(auth.uid(), new.created_by);
  if tg_op = 'INSERT' then
    insert into public.proposal_events (
      organization_id, proposal_id, event_type, actor_user_id, description
    ) values (
      new.organization_id, new.id,
      case when new.supersedes_proposal_id is null then 'created' else 'revision_created' end,
      actor_id,
      case when new.supersedes_proposal_id is null then 'Proposta criada' else 'Revisão de proposta criada' end
    );
    return null;
  end if;

  if new.selected_option_id is distinct from old.selected_option_id then
    select option_row.name into selected_name
    from public.proposal_options option_row where option_row.id = new.selected_option_id;
    select option_row.name into previous_name
    from public.proposal_options option_row where option_row.id = old.selected_option_id;
    insert into public.proposal_events (
      organization_id, proposal_id, event_type, actor_user_id, description, event_data
    ) values (
      new.organization_id, new.id,
      case when old.selected_option_id is null then 'option_selected' else 'option_selection_changed' end,
      actor_id,
      case when old.selected_option_id is null
        then 'Opção comercial selecionada'
        else 'Escolha de opção comercial alterada' end,
      jsonb_build_object(
        'option_id', new.selected_option_id,
        'option_name', selected_name,
        'total_amount', new.total_amount,
        'previous_option_id', old.selected_option_id,
        'previous_option_name', previous_name
      )
    );
  end if;

  if new.status is distinct from old.status then
    if new.selected_option_id is not null and selected_name is null then
      select option_row.name into selected_name
      from public.proposal_options option_row where option_row.id = new.selected_option_id;
    end if;
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
      new.organization_id, new.id, recorded_event_type, actor_id,
      'Status alterado de ' || old.status || ' para ' || new.status,
      jsonb_build_object(
        'from', old.status, 'to', new.status,
        'selected_option_id', new.selected_option_id,
        'selected_option_name', selected_name,
        'total_amount', new.total_amount
      )
    );
  end if;
  return null;
end;
$$;

create or replace function public.save_proposal_draft(
  target_organization_id uuid, target_proposal_id uuid, target_client_id uuid,
  target_opportunity_id uuid, target_title text, target_valid_until date,
  target_payment_terms text, target_execution_deadline text, target_notes text,
  target_commercial_terms text, target_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_proposal_id uuid;
  item jsonb;
  item_position integer := 0;
begin
  if target_items is null or jsonb_typeof(target_items) <> 'array'
     or jsonb_array_length(target_items) not between 1 and 100 then
    raise exception 'proposal must contain between 1 and 100 items';
  end if;
  if target_proposal_id is null then
    insert into public.proposals (
      organization_id, client_id, opportunity_id, title, proposal_format,
      valid_until, payment_terms, execution_deadline, notes, commercial_terms
    ) values (
      target_organization_id, target_client_id, target_opportunity_id, btrim(target_title), 'simple',
      target_valid_until, target_payment_terms, target_execution_deadline, target_notes, target_commercial_terms
    ) returning id into saved_proposal_id;
  else
    select proposal.id into saved_proposal_id
    from public.proposals proposal
    where proposal.id = target_proposal_id
      and proposal.organization_id = target_organization_id
      and proposal.client_id = target_client_id
      and proposal.proposal_format = 'simple'
      and proposal.status = 'draft'
    for update;
    if not found then raise exception 'simple draft proposal not found or access denied'; end if;
    update public.proposals proposal
    set opportunity_id = target_opportunity_id, title = btrim(target_title),
        valid_until = target_valid_until, payment_terms = target_payment_terms,
        execution_deadline = target_execution_deadline, notes = target_notes,
        commercial_terms = target_commercial_terms
    where proposal.id = saved_proposal_id and proposal.organization_id = target_organization_id;
    delete from public.proposal_items proposal_item
    where proposal_item.organization_id = target_organization_id
      and proposal_item.proposal_id = saved_proposal_id;
  end if;
  for item in select value from jsonb_array_elements(target_items) loop
    item_position := item_position + 1;
    insert into public.proposal_items (
      organization_id, proposal_id, option_id, service_id, position,
      service_name_snapshot, description, quantity, unit_price, discount_amount
    ) values (
      target_organization_id, saved_proposal_id, null,
      nullif(item ->> 'service_id', '')::uuid, item_position,
      btrim(item ->> 'service_name'), btrim(item ->> 'description'),
      (item ->> 'quantity')::numeric, (item ->> 'unit_price')::numeric,
      coalesce((item ->> 'discount_amount')::numeric, 0)
    );
  end loop;
  return saved_proposal_id;
end;
$$;

create or replace function public.save_proposal_options_draft(
  target_organization_id uuid, target_proposal_id uuid, target_client_id uuid,
  target_opportunity_id uuid, target_title text, target_valid_until date,
  target_payment_terms text, target_execution_deadline text, target_notes text,
  target_commercial_terms text, target_common_items jsonb, target_options jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_proposal_id uuid;
  saved_option_id uuid;
  option_row jsonb;
  item jsonb;
  option_position integer := 0;
  item_position integer;
begin
  if target_common_items is null or jsonb_typeof(target_common_items) <> 'array'
     or jsonb_array_length(target_common_items) > 100 then
    raise exception 'common items must contain at most 100 items';
  end if;
  if target_options is null or jsonb_typeof(target_options) <> 'array'
     or jsonb_array_length(target_options) not between 2 and 3 then
    raise exception 'options proposal must contain two or three options';
  end if;

  if target_proposal_id is null then
    insert into public.proposals (
      organization_id, client_id, opportunity_id, title, proposal_format,
      valid_until, payment_terms, execution_deadline, notes, commercial_terms
    ) values (
      target_organization_id, target_client_id, target_opportunity_id, btrim(target_title), 'options',
      target_valid_until, target_payment_terms, target_execution_deadline, target_notes, target_commercial_terms
    ) returning id into saved_proposal_id;
  else
    select proposal.id into saved_proposal_id
    from public.proposals proposal
    where proposal.id = target_proposal_id
      and proposal.organization_id = target_organization_id
      and proposal.client_id = target_client_id
      and proposal.proposal_format = 'options'
      and proposal.status = 'draft'
    for update;
    if not found then raise exception 'options draft proposal not found or access denied'; end if;
    update public.proposals proposal
    set opportunity_id = target_opportunity_id, title = btrim(target_title),
        valid_until = target_valid_until, payment_terms = target_payment_terms,
        execution_deadline = target_execution_deadline, notes = target_notes,
        commercial_terms = target_commercial_terms
    where proposal.id = saved_proposal_id and proposal.organization_id = target_organization_id;
    delete from public.proposal_items proposal_item
    where proposal_item.organization_id = target_organization_id
      and proposal_item.proposal_id = saved_proposal_id;
    delete from public.proposal_options option_to_delete
    where option_to_delete.organization_id = target_organization_id
      and option_to_delete.proposal_id = saved_proposal_id;
  end if;

  item_position := 0;
  for item in select value from jsonb_array_elements(target_common_items) loop
    item_position := item_position + 1;
    insert into public.proposal_items (
      organization_id, proposal_id, option_id, service_id, position,
      service_name_snapshot, description, quantity, unit_price, discount_amount
    ) values (
      target_organization_id, saved_proposal_id, null,
      nullif(item ->> 'service_id', '')::uuid, item_position,
      btrim(item ->> 'service_name'), btrim(item ->> 'description'),
      (item ->> 'quantity')::numeric, (item ->> 'unit_price')::numeric,
      coalesce((item ->> 'discount_amount')::numeric, 0)
    );
  end loop;

  for option_row in select value from jsonb_array_elements(target_options) loop
    option_position := option_position + 1;
    if option_row -> 'items' is null or jsonb_typeof(option_row -> 'items') <> 'array'
       or jsonb_array_length(option_row -> 'items') not between 1 and 100 then
      raise exception 'each commercial option must contain between 1 and 100 items';
    end if;
    insert into public.proposal_options (
      organization_id, proposal_id, name, description, position
    ) values (
      target_organization_id, saved_proposal_id, btrim(option_row ->> 'name'),
      nullif(btrim(option_row ->> 'description'), ''), option_position
    ) returning id into saved_option_id;

    item_position := 0;
    for item in select value from jsonb_array_elements(option_row -> 'items') loop
      item_position := item_position + 1;
      insert into public.proposal_items (
        organization_id, proposal_id, option_id, service_id, position,
        service_name_snapshot, description, quantity, unit_price, discount_amount
      ) values (
        target_organization_id, saved_proposal_id, saved_option_id,
        nullif(item ->> 'service_id', '')::uuid, item_position,
        btrim(item ->> 'service_name'), btrim(item ->> 'description'),
        (item ->> 'quantity')::numeric, (item ->> 'unit_price')::numeric,
        coalesce((item ->> 'discount_amount')::numeric, 0)
      );
    end loop;
  end loop;
  return saved_proposal_id;
end;
$$;

create or replace function public.select_proposal_option(
  target_proposal_id uuid,
  target_option_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_proposal record;
begin
  select proposal.id, proposal.organization_id, proposal.status,
         proposal.proposal_format, proposal.selected_option_id
    into current_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
  for update;
  if not found then raise exception 'proposal not found or access denied'; end if;
  if current_proposal.proposal_format <> 'options' then raise exception 'proposal does not use commercial options'; end if;
  if current_proposal.status not in ('sent', 'negotiating') then raise exception 'proposal option cannot be selected in status %', current_proposal.status; end if;
  if not exists (
    select 1 from public.proposal_options option_row
    where option_row.organization_id = current_proposal.organization_id
      and option_row.proposal_id = current_proposal.id
      and option_row.id = target_option_id
  ) then raise exception 'selected option does not belong to proposal'; end if;
  if current_proposal.selected_option_id = target_option_id then return target_option_id; end if;
  update public.proposals proposal set selected_option_id = target_option_id
  where proposal.organization_id = current_proposal.organization_id
    and proposal.id = current_proposal.id;
  return target_option_id;
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
  select proposal.id, proposal.organization_id, proposal.status,
         proposal.proposal_format, proposal.selected_option_id
    into current_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
  for update;
  if not found then raise exception 'proposal not found or access denied'; end if;
  if not private.has_org_role(current_proposal.organization_id, array['owner', 'admin']) then
    raise exception 'only organization owners and admins can approve proposals' using errcode = '42501';
  end if;
  if current_proposal.status = 'approved' then return current_proposal.id; end if;
  if current_proposal.status not in ('sent', 'negotiating') then
    raise exception 'proposal cannot be approved from status %', current_proposal.status;
  end if;
  if current_proposal.proposal_format = 'options' and current_proposal.selected_option_id is null then
    raise exception 'an option must be selected before approving an options proposal';
  end if;
  update public.proposals proposal set status = 'approved'
  where proposal.id = current_proposal.id
    and proposal.organization_id = current_proposal.organization_id;
  return current_proposal.id;
end;
$$;

create or replace function public.approve_proposal_option(
  target_proposal_id uuid,
  target_option_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_proposal record;
begin
  select proposal.id, proposal.organization_id, proposal.status,
         proposal.proposal_format, proposal.selected_option_id
    into current_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
  for update;
  if not found then raise exception 'proposal not found or access denied'; end if;
  if not private.has_org_role(current_proposal.organization_id, array['owner', 'admin']) then
    raise exception 'only organization owners and admins can approve proposals' using errcode = '42501';
  end if;
  if current_proposal.status = 'approved' then
    if current_proposal.selected_option_id <> target_option_id then
      raise exception 'approved proposal option is immutable';
    end if;
    return current_proposal.id;
  end if;
  if current_proposal.proposal_format <> 'options' then raise exception 'proposal does not use commercial options'; end if;
  if current_proposal.status not in ('sent', 'negotiating') then
    raise exception 'proposal cannot be approved from status %', current_proposal.status;
  end if;
  if not exists (
    select 1 from public.proposal_options option_row
    where option_row.organization_id = current_proposal.organization_id
      and option_row.proposal_id = current_proposal.id
      and option_row.id = target_option_id
  ) then raise exception 'selected option does not belong to proposal'; end if;
  update public.proposals proposal
  set selected_option_id = target_option_id, status = 'approved'
  where proposal.id = current_proposal.id
    and proposal.organization_id = current_proposal.organization_id;
  return current_proposal.id;
end;
$$;

create or replace function public.create_proposal_revision(target_proposal_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_proposal record;
  previous_option record;
  revision_id uuid;
  revision_option_id uuid;
begin
  select proposal.* into previous_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
    and proposal.status in ('approved', 'rejected', 'expired', 'cancelled')
  for update;
  if not found then raise exception 'terminal proposal not found or access denied'; end if;
  insert into public.proposals (
    organization_id, client_id, opportunity_id, supersedes_proposal_id, title,
    proposal_format, valid_until, payment_terms, execution_deadline, notes, commercial_terms
  ) values (
    previous_proposal.organization_id, previous_proposal.client_id,
    previous_proposal.opportunity_id, previous_proposal.id, previous_proposal.title,
    previous_proposal.proposal_format, previous_proposal.valid_until,
    previous_proposal.payment_terms, previous_proposal.execution_deadline,
    previous_proposal.notes, previous_proposal.commercial_terms
  ) returning id into revision_id;

  insert into public.proposal_items (
    organization_id, proposal_id, option_id, service_id, position,
    service_name_snapshot, description, quantity, unit_price, discount_amount
  )
  select item.organization_id, revision_id, null, item.service_id, item.position,
         item.service_name_snapshot, item.description, item.quantity,
         item.unit_price, item.discount_amount
  from public.proposal_items item
  where item.organization_id = previous_proposal.organization_id
    and item.proposal_id = previous_proposal.id
    and item.option_id is null
  order by item.position;

  for previous_option in
    select option_row.* from public.proposal_options option_row
    where option_row.organization_id = previous_proposal.organization_id
      and option_row.proposal_id = previous_proposal.id
    order by option_row.position
  loop
    insert into public.proposal_options (
      organization_id, proposal_id, name, description, position
    ) values (
      previous_option.organization_id, revision_id, previous_option.name,
      previous_option.description, previous_option.position
    ) returning id into revision_option_id;
    insert into public.proposal_items (
      organization_id, proposal_id, option_id, service_id, position,
      service_name_snapshot, description, quantity, unit_price, discount_amount
    )
    select item.organization_id, revision_id, revision_option_id, item.service_id,
           item.position, item.service_name_snapshot, item.description,
           item.quantity, item.unit_price, item.discount_amount
    from public.proposal_items item
    where item.organization_id = previous_proposal.organization_id
      and item.proposal_id = previous_proposal.id
      and item.option_id = previous_option.id
    order by item.position;
  end loop;
  return revision_id;
end;
$$;

drop trigger proposals_identity_immutable on public.proposals;
create trigger proposals_identity_immutable before update on public.proposals
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'client_id', 'proposal_number', 'code', 'revision_group_id',
    'revision_number', 'supersedes_proposal_id', 'proposal_format', 'created_by', 'created_at'
  );

drop trigger proposal_items_identity_immutable on public.proposal_items;
create trigger proposal_items_identity_immutable before update on public.proposal_items
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'proposal_id', 'option_id', 'created_by', 'created_at'
  );
create trigger proposal_items_assert_scope before insert or update on public.proposal_items
  for each row execute function private.assert_proposal_item_scope();

create trigger proposal_options_assert_scope before insert or update on public.proposal_options
  for each row execute function private.assert_proposal_option_scope();
create trigger proposal_options_identity_immutable before update on public.proposal_options
  for each row execute function private.prevent_protected_columns_change(
    'organization_id', 'proposal_id', 'created_by', 'created_at'
  );
create trigger proposal_options_set_updated_at before update on public.proposal_options
  for each row execute function private.set_updated_at();

create constraint trigger proposals_structure_valid
  after insert or update on public.proposals
  deferrable initially deferred for each row
  execute function private.enforce_proposal_structure();
create constraint trigger proposal_options_structure_valid
  after insert or update or delete on public.proposal_options
  deferrable initially deferred for each row
  execute function private.enforce_proposal_structure();
create constraint trigger proposal_items_structure_valid
  after insert or update or delete on public.proposal_items
  deferrable initially deferred for each row
  execute function private.enforce_proposal_structure();

alter table public.proposal_options enable row level security;
revoke all on table public.proposal_options from public, anon, authenticated;
grant select, insert, delete on table public.proposal_options to authenticated;
grant update (name, description, position) on table public.proposal_options to authenticated;
grant update (selected_option_id) on table public.proposals to authenticated;

create policy proposal_options_select_active_members
  on public.proposal_options for select to authenticated
  using (private.is_active_org_member(organization_id));
create policy proposal_options_insert_draft
  on public.proposal_options for insert to authenticated
  with check (
    private.is_active_org_member(organization_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_options.organization_id
        and proposal.id = proposal_options.proposal_id
        and proposal.proposal_format = 'options'
        and proposal.status = 'draft'
    )
  );
create policy proposal_options_update_draft
  on public.proposal_options for update to authenticated
  using (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_options.organization_id
        and proposal.id = proposal_options.proposal_id
        and proposal.status = 'draft'
    )
  )
  with check (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_options.organization_id
        and proposal.id = proposal_options.proposal_id
        and proposal.status = 'draft'
    )
  );
create policy proposal_options_delete_draft
  on public.proposal_options for delete to authenticated
  using (
    private.is_active_org_member(organization_id)
    and exists (
      select 1 from public.proposals proposal
      where proposal.organization_id = proposal_options.organization_id
        and proposal.id = proposal_options.proposal_id
        and proposal.status = 'draft'
    )
  );

revoke all on function private.assert_proposal_option_scope() from public, anon, authenticated;
revoke all on function private.assert_proposal_item_scope() from public, anon, authenticated;
revoke all on function private.enforce_proposal_structure() from public, anon, authenticated;
revoke all on function private.recalculate_proposal_totals() from public, anon, authenticated;
revoke all on function private.prepare_proposal() from public, anon, authenticated;
revoke all on function private.record_proposal_event() from public, anon, authenticated;
revoke all on function public.save_proposal_options_draft(uuid, uuid, uuid, uuid, text, date, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.select_proposal_option(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_proposal(uuid) from public, anon, authenticated;
revoke all on function public.approve_proposal_option(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_proposal_revision(uuid) from public, anon, authenticated;

grant execute on function public.save_proposal_options_draft(uuid, uuid, uuid, uuid, text, date, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.select_proposal_option(uuid, uuid) to authenticated;
grant execute on function public.approve_proposal(uuid) to authenticated;
grant execute on function public.approve_proposal_option(uuid, uuid) to authenticated;
grant execute on function public.create_proposal_revision(uuid) to authenticated;

comment on column public.proposals.proposal_format is
  'simple preserva itens existentes; options representa duas ou três alternativas mutuamente exclusivas.';
comment on column public.proposals.selected_option_id is
  'Alternativa contratada. Nula antes da escolha e em toda nova revisão.';
comment on column public.proposals.total_amount is
  'Em proposta simples, total dos itens. Em proposta com opções, NULL antes da escolha e total final da opção escolhida depois dela.';
comment on table public.proposal_options is
  'Alternativas comerciais da proposta; totais incluem itens comuns e exclusivos sem duplicar os itens comuns.';
comment on column public.proposal_items.option_id is
  'NULL significa item simples ou comum a todas as opções; UUID significa item exclusivo daquela opção.';
comment on function public.select_proposal_option(uuid, uuid) is
  'Registra ou altera de forma idempotente a alternativa escolhida, sob bloqueio da proposta e RLS.';
comment on function public.approve_proposal_option(uuid, uuid) is
  'Seleciona e aprova atomicamente uma alternativa, restrita a owner/admin ativos.';

commit;
