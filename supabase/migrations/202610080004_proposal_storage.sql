begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'proposal-documents',
  'proposal-documents',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $storage_bucket_validation$
begin
  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'proposal-documents'
      and bucket.public = false
  ) then
    raise exception 'proposal-documents must exist as a private bucket';
  end if;
end;
$storage_bucket_validation$;

create policy proposal_documents_select_active_members
  on storage.objects for select to authenticated
  using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.proposal_attachments attachment
      where attachment.storage_bucket = storage.objects.bucket_id
        and attachment.storage_object_path = storage.objects.name
        and attachment.storage_deleted_at is null
        and private.is_active_org_member(attachment.organization_id)
    )
  );

create policy proposal_documents_insert_uploader
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.proposal_attachments attachment
      where attachment.storage_bucket = storage.objects.bucket_id
        and attachment.storage_object_path = storage.objects.name
        and attachment.storage_deleted_at is null
        and attachment.uploaded_by = (select auth.uid())
        and private.is_active_org_member(attachment.organization_id)
    )
  );

create policy proposal_documents_delete_admins
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.proposal_attachments attachment
      where attachment.storage_bucket = storage.objects.bucket_id
        and attachment.storage_object_path = storage.objects.name
        and private.has_org_role(attachment.organization_id, array['owner', 'admin'])
    )
  );

comment on table public.proposal_attachments is
  'Metadados de PDFs privados. Objetos devem usar organization_id/proposal_id/attachment_id/arquivo.pdf e operações físicas devem passar pela Storage API.';

commit;
