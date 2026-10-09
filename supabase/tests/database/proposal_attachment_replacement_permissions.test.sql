begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id,email) values
('16000000-0000-4000-8000-000000000001','owner@attachment-replacement.test'),
('16000000-0000-4000-8000-000000000002','member-a@attachment-replacement.test'),
('16000000-0000-4000-8000-000000000003','member-b@attachment-replacement.test');
insert into public.organizations (id,name,slug) values
('26000000-0000-4000-8000-000000000001','Attachment replacement','attachment-replacement');
insert into public.organization_members (organization_id,user_id,role,status,created_by,joined_at) values
('26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','owner','active','16000000-0000-4000-8000-000000000001',now()),
('26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002','member','active','16000000-0000-4000-8000-000000000001',now()),
('26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000003','member','active','16000000-0000-4000-8000-000000000001',now());
insert into public.clients (id,organization_id,name,created_by) values
('36000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','Cliente','16000000-0000-4000-8000-000000000001');
insert into public.proposals (id,organization_id,client_id,title,created_by) values
('56000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','Proposta','16000000-0000-4000-8000-000000000001');
insert into public.proposal_items (
  id, organization_id, proposal_id, position, service_name_snapshot,
  description, quantity, unit_price, discount_amount, created_by
) values (
  '65000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001', 1,
  'Item da proposta', 'Mantém a fixture estruturalmente válida', 1, 10, 0,
  '16000000-0000-4000-8000-000000000001'
);
insert into public.proposal_attachments (id,organization_id,proposal_id,original_file_name,storage_object_path,mime_type,size_bytes,uploaded_by) values
('66000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','owner.pdf','26000000-0000-4000-8000-000000000001/56000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/owner.pdf','application/pdf',100,'16000000-0000-4000-8000-000000000001'),
('66000000-0000-4000-8000-000000000002','26000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','member.pdf','26000000-0000-4000-8000-000000000001/56000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000002/member.pdf','application/pdf',100,'16000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$
 insert into public.proposal_attachments (id,organization_id,proposal_id,supersedes_attachment_id,original_file_name,storage_object_path,mime_type,size_bytes)
 values ('66000000-0000-4000-8000-000000000003','26000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','blocked.pdf','26000000-0000-4000-8000-000000000001/56000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000003/blocked.pdf','application/pdf',100)
$$,'42501','only the uploader or an organization administrator can replace this attachment','member não substitui anexo de outro usuário pela Data API');
select is((select is_current from public.proposal_attachments where id='66000000-0000-4000-8000-000000000001'),true,'tentativa negada mantém versão anterior atual');
select is((select count(*)::bigint from public.proposal_attachments where id='66000000-0000-4000-8000-000000000003'),0::bigint,'tentativa negada não deixa metadado parcial');
select lives_ok($$
 insert into public.proposal_attachments (id,organization_id,proposal_id,supersedes_attachment_id,original_file_name,storage_object_path,mime_type,size_bytes)
 values ('66000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000002','member-v2.pdf','26000000-0000-4000-8000-000000000001/56000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000004/member-v2.pdf','application/pdf',100)
$$,'member substitui o próprio anexo');
select is((select version from public.proposal_attachments where id='66000000-0000-4000-8000-000000000004'),2,'versão própria é incrementada');
select is((select is_current from public.proposal_attachments where id='66000000-0000-4000-8000-000000000002'),false,'versão própria anterior deixa de ser atual');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$
 insert into public.proposal_attachments (id,organization_id,proposal_id,supersedes_attachment_id,original_file_name,storage_object_path,mime_type,size_bytes)
 values ('66000000-0000-4000-8000-000000000005','26000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000004','admin-v3.pdf','26000000-0000-4000-8000-000000000001/56000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000005/admin-v3.pdf','application/pdf',100)
$$,'owner substitui anexo de member');
select is((select version from public.proposal_attachments where id='66000000-0000-4000-8000-000000000005'),3,'substituição administrativa mantém a sequência');
select is((select logical_file_id from public.proposal_attachments where id='66000000-0000-4000-8000-000000000005'),(select logical_file_id from public.proposal_attachments where id='66000000-0000-4000-8000-000000000002'),'substituição preserva o arquivo lógico');
set constraints all immediate;
select * from finish();
rollback;
