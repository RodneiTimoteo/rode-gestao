begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- A autorização vive no trigger para cobrir tanto a RPC quanto UPDATEs diretos.
-- A função continua SECURITY DEFINER apenas porque também mantém numeração,
-- revisões e campos derivados; a decisão usa auth.uid() via has_org_role.
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
      if not private.has_org_role(new.organization_id, array['owner', 'admin']) then
        raise exception 'only organization owners and admins can approve proposals'
          using errcode = '42501';
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

  -- Deliberadamente antes do retorno idempotente: um member não pode usar uma
  -- proposta já aprovada como oráculo nem contornar a regra da operação.
  if not private.has_org_role(current_proposal.organization_id, array['owner', 'admin']) then
    raise exception 'only organization owners and admins can approve proposals'
      using errcode = '42501';
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

-- O formulário precisa salvar cabeçalho e itens como uma unidade. SECURITY
-- INVOKER mantém grants, RLS, FKs compostas e triggers como barreiras efetivas.
create or replace function public.save_proposal_draft(
  target_organization_id uuid,
  target_proposal_id uuid,
  target_client_id uuid,
  target_opportunity_id uuid,
  target_title text,
  target_valid_until date,
  target_payment_terms text,
  target_execution_deadline text,
  target_notes text,
  target_commercial_terms text,
  target_items jsonb
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
     or jsonb_array_length(target_items) = 0
     or jsonb_array_length(target_items) > 100 then
    raise exception 'proposal must contain between 1 and 100 items';
  end if;

  if target_proposal_id is null then
    insert into public.proposals (
      organization_id, client_id, opportunity_id, title, valid_until,
      payment_terms, execution_deadline, notes, commercial_terms
    ) values (
      target_organization_id, target_client_id, target_opportunity_id, btrim(target_title),
      target_valid_until, target_payment_terms, target_execution_deadline, target_notes,
      target_commercial_terms
    ) returning id into saved_proposal_id;
  else
    select proposal.id into saved_proposal_id
    from public.proposals proposal
    where proposal.id = target_proposal_id
      and proposal.organization_id = target_organization_id
      and proposal.client_id = target_client_id
      and proposal.status = 'draft'
    for update;

    if not found then
      raise exception 'draft proposal not found or access denied';
    end if;

    update public.proposals proposal
    set opportunity_id = target_opportunity_id,
        title = btrim(target_title),
        valid_until = target_valid_until,
        payment_terms = target_payment_terms,
        execution_deadline = target_execution_deadline,
        notes = target_notes,
        commercial_terms = target_commercial_terms
    where proposal.id = saved_proposal_id
      and proposal.organization_id = target_organization_id;

    delete from public.proposal_items proposal_item
    where proposal_item.organization_id = target_organization_id
      and proposal_item.proposal_id = saved_proposal_id;
  end if;

  for item in select value from jsonb_array_elements(target_items) loop
    item_position := item_position + 1;
    insert into public.proposal_items (
      organization_id, proposal_id, service_id, position,
      service_name_snapshot, description, quantity, unit_price, discount_amount
    ) values (
      target_organization_id,
      saved_proposal_id,
      nullif(item ->> 'service_id', '')::uuid,
      item_position,
      btrim(item ->> 'service_name'),
      btrim(item ->> 'description'),
      (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric,
      coalesce((item ->> 'discount_amount')::numeric, 0)
    );
  end loop;

  return saved_proposal_id;
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
  revision_id uuid;
begin
  select proposal.* into previous_proposal
  from public.proposals proposal
  where proposal.id = target_proposal_id
    and proposal.status in ('approved', 'rejected', 'expired', 'cancelled')
  for update;

  if not found then
    raise exception 'terminal proposal not found or access denied';
  end if;

  insert into public.proposals (
    organization_id, client_id, opportunity_id, supersedes_proposal_id, title,
    valid_until, payment_terms, execution_deadline, notes, commercial_terms
  ) values (
    previous_proposal.organization_id, previous_proposal.client_id,
    previous_proposal.opportunity_id, previous_proposal.id,
    previous_proposal.title, previous_proposal.valid_until,
    previous_proposal.payment_terms, previous_proposal.execution_deadline,
    previous_proposal.notes, previous_proposal.commercial_terms
  ) returning id into revision_id;

  insert into public.proposal_items (
    organization_id, proposal_id, service_id, position, service_name_snapshot,
    description, quantity, unit_price, discount_amount
  )
  select item.organization_id, revision_id, item.service_id, item.position,
    item.service_name_snapshot, item.description, item.quantity,
    item.unit_price, item.discount_amount
  from public.proposal_items item
  where item.organization_id = previous_proposal.organization_id
    and item.proposal_id = previous_proposal.id
  order by item.position;

  return revision_id;
end;
$$;

revoke all on function private.prepare_proposal() from public, anon, authenticated;
revoke all on function public.approve_proposal(uuid) from public, anon, authenticated;
revoke all on function public.save_proposal_draft(uuid, uuid, uuid, uuid, text, date, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_proposal_revision(uuid) from public, anon, authenticated;
grant execute on function public.approve_proposal(uuid) to authenticated;
grant execute on function public.save_proposal_draft(uuid, uuid, uuid, uuid, text, date, text, text, text, text, jsonb) to authenticated;
grant execute on function public.create_proposal_revision(uuid) to authenticated;

comment on function public.approve_proposal(uuid) is
  'Aprovação transacional e idempotente, restrita a owner/admin ativos da organização da proposta.';
comment on function public.save_proposal_draft(uuid, uuid, uuid, uuid, text, date, text, text, text, text, jsonb) is
  'Salva cabeçalho e itens de um rascunho atomicamente sob RLS; client_id permanece imutável em edições.';
comment on function public.create_proposal_revision(uuid) is
  'Cria atomicamente uma revisão em rascunho e copia os itens da proposta terminal acessível.';

commit;
