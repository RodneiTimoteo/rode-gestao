begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

insert into auth.users (id, email)
values
  ('11000000-0000-4000-8000-000000000001', 'owner-a@stage4a.test'),
  ('11000000-0000-4000-8000-000000000002', 'admin-a@stage4a.test'),
  ('11000000-0000-4000-8000-000000000003', 'member-a@stage4a.test'),
  ('11000000-0000-4000-8000-000000000004', 'owner-b@stage4a.test'),
  ('11000000-0000-4000-8000-000000000005', 'external@stage4a.test');

insert into public.organizations (id, name, slug)
values
  ('21000000-0000-4000-8000-000000000001', 'Stage 4A A', 'stage-4a-a'),
  ('21000000-0000-4000-8000-000000000002', 'Stage 4A B', 'stage-4a-b');

insert into public.organization_members (
  organization_id, user_id, role, status, created_by, joined_at
)
values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner', 'active', '11000000-0000-4000-8000-000000000001', now()),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'admin', 'active', '11000000-0000-4000-8000-000000000001', now()),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'member', 'active', '11000000-0000-4000-8000-000000000001', now()),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000004', 'owner', 'active', '11000000-0000-4000-8000-000000000004', now());

insert into public.clients (id, organization_id, name, created_by)
values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Cliente A', '11000000-0000-4000-8000-000000000001'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Cliente B', '11000000-0000-4000-8000-000000000004');

insert into public.services (id, organization_id, name, billing_type, reference_price, created_by)
values
  ('41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Serviço A', 'fixed', 1000, '11000000-0000-4000-8000-000000000001'),
  ('41000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Serviço B', 'fixed', 2000, '11000000-0000-4000-8000-000000000004');

insert into public.proposals (
  id, organization_id, client_id, title,
  subtotal_amount, discount_amount, total_amount, created_by
)
values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Proposta A1', 0, 0, 0, '11000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Proposta A2', 999, 0, 999, '11000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'Proposta B1', 0, 0, 0, '11000000-0000-4000-8000-000000000004');

insert into public.proposal_items (
  id, organization_id, proposal_id, service_id, position,
  service_name_snapshot, description, quantity, unit_price, discount_amount, created_by
)
values (
  '61000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  1, 'Serviço A', 'Snapshot negociado', 2, 750, 100,
  '11000000-0000-4000-8000-000000000001'
);

insert into public.proposal_attachments (
  id, organization_id, proposal_id, original_file_name, storage_object_path,
  mime_type, size_bytes, checksum_sha256, uploaded_by
)
values (
  '71000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'proposta-a1.pdf',
  '21000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/proposta-a1.pdf',
  'application/pdf', 1024, repeat('a', 64),
  '11000000-0000-4000-8000-000000000001'
);

insert into storage.objects (id, bucket_id, name)
values (
  '81000000-0000-4000-8000-000000000001',
  'proposal-documents',
  '21000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001/71000000-0000-4000-8000-000000000001/proposta-a1.pdf'
);

select ok(not has_table_privilege('anon', 'public.proposals', 'select'), 'anon não recebe SELECT em propostas');
select ok(not has_table_privilege('anon', 'public.projects', 'insert'), 'anon não recebe INSERT em projetos');
select ok(not has_table_privilege('authenticated', 'public.proposal_events', 'insert'), 'eventos são append-only para a Data API');
select ok(not has_column_privilege('authenticated', 'public.proposals', 'total_amount', 'update'), 'totais não são atualizáveis pelo navegador');
select is((select line_total from public.proposal_items where id = '61000000-0000-4000-8000-000000000001'), 1400.00::numeric, 'total do item é calculado no banco');
select is((select total_amount from public.proposals where id = '51000000-0000-4000-8000-000000000001'), 1400.00::numeric, 'total da proposta é sincronizado no banco');
select is((select total_amount from public.proposals where id = '51000000-0000-4000-8000-000000000002'), 0.00::numeric, 'total informado no INSERT é ignorado pelo banco');
select isnt(
  (select proposal_number from public.proposals where id = '51000000-0000-4000-8000-000000000001'),
  (select proposal_number from public.proposals where id = '51000000-0000-4000-8000-000000000002'),
  'numeração é única por organização'
);
select is((select count(*)::bigint from public.proposal_events where proposal_id = '51000000-0000-4000-8000-000000000001' and event_type = 'created'), 1::bigint, 'criação registra evento automático');

select throws_ok(
  $$
    insert into public.proposals (organization_id, client_id, title, created_by)
    values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'Referência cruzada', '11000000-0000-4000-8000-000000000001')
  $$,
  '23503', null, 'FK composta rejeita cliente de outra organização'
);
select throws_ok(
  $$
    update public.services
    set organization_id = '21000000-0000-4000-8000-000000000002'
    where id = '41000000-0000-4000-8000-000000000001'
  $$,
  'P0001', 'organization_id cannot be changed', 'organização do serviço é imutável'
);
select throws_ok(
  $$
    insert into public.proposal_attachments (
      organization_id, proposal_id, original_file_name, storage_object_path,
      mime_type, size_bytes, uploaded_by
    ) values (
      '21000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      'malware.exe',
      '21000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000099/malware.exe',
      'application/octet-stream', 1,
      '11000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514', null, 'metadados rejeitam arquivo não PDF'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*)::bigint from public.proposals), 2::bigint, 'member lê somente propostas da própria organização');
select is((select count(*)::bigint from public.proposal_attachments), 1::bigint, 'member lê metadados de anexos da própria organização');
select is((select count(*)::bigint from storage.objects where bucket_id = 'proposal-documents'), 1::bigint, 'member lê objeto privado vinculado à sua organização');
select throws_ok(
  $$ insert into public.services (organization_id, name) values ('21000000-0000-4000-8000-000000000001', 'Serviço proibido') $$,
  '42501', null, 'member não administra catálogo de serviços'
);
select lives_ok(
  $$ insert into public.proposals (organization_id, client_id, title) values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Proposta do member') $$,
  'member ativo cria proposta na própria organização'
);
select throws_ok(
  $$ insert into public.proposals (organization_id, client_id, title) values ('21000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'Invasão') $$,
  '42501', null, 'member não cria proposta em outra organização'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('proposal-documents', 'arquivo-sem-metadado.pdf') $$,
  '42501', null, 'upload sem metadado autorizado é bloqueado no Storage'
);

update public.proposals set status = 'sent' where id = '51000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.approve_proposal('51000000-0000-4000-8000-000000000001') $$, 'aprovação válida é transacional');
select lives_ok($$ select public.approve_proposal('51000000-0000-4000-8000-000000000001') $$, 'repetir aprovação é idempotente');
select is(
  (select count(*)::bigint from public.proposal_events where proposal_id = '51000000-0000-4000-8000-000000000001' and event_type = 'approved'),
  1::bigint,
  'aprovação idempotente registra somente uma transição'
);
select throws_ok(
  $$ update public.proposals set title = 'Sobrescrita indevida' where id = '51000000-0000-4000-8000-000000000001' $$,
  'P0001', 'terminal proposals are immutable; create a revision', 'proposta aprovada não é sobrescrita'
);
select throws_ok(
  $$
    insert into public.proposal_items (
      organization_id, proposal_id, position, service_name_snapshot,
      description, quantity, unit_price
    ) values (
      '21000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001', 2,
      'Item tardio', 'Não permitido', 1, 10
    )
  $$,
  '42501', null, 'itens não são inseridos após aprovação'
);
select lives_ok(
  $$
    insert into public.proposals (organization_id, client_id, supersedes_proposal_id, title)
    values (
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      'Revisão da proposta A1'
    )
  $$,
  'proposta terminal pode originar nova revisão sem sobrescrita'
);
select is(
  (
    select revision_number
    from public.proposals
    where supersedes_proposal_id = '51000000-0000-4000-8000-000000000001'
  ),
  2,
  'revisão recebe número incremental no mesmo grupo'
);

select lives_ok(
  $$
    insert into public.projects (
      id, organization_id, client_id, proposal_id, name
    ) values (
      '91000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      'Projeto originado da proposta'
    )
  $$,
  'projeto pode referenciar proposta aprovada do mesmo cliente'
);
select throws_ok(
  $$
    insert into public.projects (organization_id, client_id, proposal_id, name)
    values (
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001',
      'Duplicado'
    )
  $$,
  '23505', null, 'índice único impede dois projetos para a mesma proposta'
);
select throws_ok(
  $$
    insert into public.projects (organization_id, client_id, proposal_id, name)
    values (
      '21000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      'Proposta ainda em rascunho'
    )
  $$,
  'P0001', null, 'projeto não referencia proposta sem aprovação'
);
select lives_ok(
  $$
    insert into public.projects (organization_id, client_id, name)
    values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Projeto manual')
  $$,
  'projeto manual sem proposta é permitido'
);
select throws_ok(
  $$ insert into public.project_templates (organization_id, name) values ('21000000-0000-4000-8000-000000000001', 'Template proibido') $$,
  '42501', null, 'member não administra templates'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.services (organization_id, name) values ('21000000-0000-4000-8000-000000000001', 'Serviço do admin') $$,
  'admin administra catálogo da própria organização'
);
select lives_ok(
  $$ insert into public.project_templates (organization_id, name) values ('21000000-0000-4000-8000-000000000001', 'Template do admin') $$,
  'admin administra templates da própria organização'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is((select count(*)::bigint from public.proposals), 1::bigint, 'owner B lê somente propostas da organização B');
select is((select count(*)::bigint from public.proposal_attachments), 0::bigint, 'owner B não lê metadados de anexos da organização A');
select is((select count(*)::bigint from storage.objects where bucket_id = 'proposal-documents'), 0::bigint, 'owner B não lê objeto privado da organização A');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select is((select count(*)::bigint from public.proposals), 0::bigint, 'usuário externo não lê propostas');
select is((select count(*)::bigint from public.projects), 0::bigint, 'usuário externo não lê projetos');
select is((select count(*)::bigint from storage.objects where bucket_id = 'proposal-documents'), 0::bigint, 'usuário externo não lê objetos privados');
select throws_ok(
  $$ insert into public.projects (organization_id, client_id, name) values ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'Projeto externo') $$,
  '42501', null, 'usuário externo não cria projeto'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select count(*) from public.proposals $$, '42501', null, 'anônimo não lê propostas');
select is((select count(*)::bigint from storage.objects where bucket_id = 'proposal-documents'), 0::bigint, 'anônimo não lê objetos do bucket privado');

reset role;

select * from finish();

rollback;
