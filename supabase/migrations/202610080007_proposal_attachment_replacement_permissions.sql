begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

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

  select
    attachment.logical_file_id,
    attachment.version,
    attachment.is_current,
    attachment.uploaded_by
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
  if previous_attachment.uploaded_by <> (select auth.uid())
    and not private.has_org_role(new.organization_id, array['owner', 'admin']) then
    raise exception using
      errcode = '42501',
      message = 'only the uploader or an organization administrator can replace this attachment';
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

revoke all on function private.prepare_proposal_attachment() from public, anon, authenticated;

comment on function private.prepare_proposal_attachment() is
  'Versiona anexos e impede que members substituam documentos enviados por outro usuário; owner/admin podem administrar versões.';

commit;
