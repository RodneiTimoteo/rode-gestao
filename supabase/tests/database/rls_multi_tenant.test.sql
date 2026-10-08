begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@rls.test'),
  ('10000000-0000-0000-0000-000000000002', 'member-a@rls.test'),
  ('10000000-0000-0000-0000-000000000003', 'owner-b@rls.test');

insert into public.organizations (id, name, slug)
values
  ('20000000-0000-0000-0000-000000000001', 'Organização A', 'rls-org-a'),
  ('20000000-0000-0000-0000-000000000002', 'Organização B', 'rls-org-b');

insert into public.organization_members (
  organization_id,
  user_id,
  role,
  status,
  created_by,
  joined_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'owner',
    'active',
    '10000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'member',
    'active',
    '10000000-0000-0000-0000-000000000001',
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    'owner',
    'active',
    '10000000-0000-0000-0000-000000000003',
    now()
  );

insert into public.pipeline_stages (id, organization_id, key, name, position)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'test_stage',
    'Etapa A',
    10
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'test_stage',
    'Etapa B',
    10
  );

insert into public.clients (id, organization_id, name, created_by)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Cliente A',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Cliente B',
    '10000000-0000-0000-0000-000000000003'
  );

select ok(
  not has_table_privilege('anon', 'public.organizations', 'select'),
  'anon não recebe SELECT em organizations'
);
select ok(
  not has_table_privilege('anon', 'public.clients', 'insert'),
  'anon não recebe INSERT em clients'
);
select ok(
  not has_column_privilege('authenticated', 'public.organizations', 'status', 'update'),
  'status da organização não pode ser alterado pela Data API'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::bigint from public.organizations),
  1::bigint,
  'membro ativo enxerga somente sua organização'
);
select is(
  (select count(*)::bigint from public.clients),
  1::bigint,
  'membro ativo enxerga somente clientes da sua organização'
);
select lives_ok(
  $$
    insert into public.clients (organization_id, name)
    values ('20000000-0000-0000-0000-000000000001', 'Cliente criado pelo membro')
  $$,
  'membro ativo pode criar cliente na própria organização'
);
select throws_ok(
  $$
    insert into public.clients (organization_id, name)
    values ('20000000-0000-0000-0000-000000000002', 'Invasão entre organizações')
  $$,
  '42501',
  null,
  'membro não pode criar cliente em outra organização'
);

update public.organization_members
set role = 'owner'
where organization_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';

update public.pipeline_stages
set name = 'Alteração indevida'
where id = '40000000-0000-0000-0000-000000000001';

reset role;

select is(
  (
    select role
    from public.organization_members
    where organization_id = '20000000-0000-0000-0000-000000000001'
      and user_id = '10000000-0000-0000-0000-000000000002'
  ),
  'member',
  'membro comum não eleva o próprio papel'
);
select is(
  (select name from public.pipeline_stages where id = '40000000-0000-0000-0000-000000000001'),
  'Etapa A',
  'membro comum não altera etapas do pipeline'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::bigint
    from public.clients
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'não membro não lê cliente de outra organização'
);

update public.clients
set name = 'Alteração cruzada'
where id = '30000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select name from public.clients where id = '30000000-0000-0000-0000-000000000001'),
  'Cliente A',
  'não membro não altera cliente de outra organização'
);

select throws_ok(
  $$
    insert into public.opportunities (
      organization_id,
      client_id,
      pipeline_stage_id,
      title,
      created_by
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      'Referência cruzada',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '23503',
  null,
  'FK composta rejeita cliente de outra organização'
);

insert into public.opportunities (
  id,
  organization_id,
  client_id,
  pipeline_stage_id,
  title,
  created_by
)
values (
  '50000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Oportunidade A',
  '10000000-0000-0000-0000-000000000001'
);

select throws_ok(
  $$
    insert into public.client_activities (
      organization_id,
      client_id,
      opportunity_id,
      activity_type,
      description,
      author_user_id
    )
    values (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '50000000-0000-0000-0000-000000000001',
      'note',
      'Referência cruzada',
      '10000000-0000-0000-0000-000000000001'
    )
  $$,
  '23503',
  null,
  'FK composta rejeita atividade ligada a cliente divergente'
);

select throws_ok(
  $$
    update public.clients
    set organization_id = '20000000-0000-0000-0000-000000000002'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'organization_id cannot be changed',
  'trigger impede reatribuição de organização'
);

select throws_ok(
  $$
    update public.organization_members
    set status = 'suspended'
    where organization_id = '20000000-0000-0000-0000-000000000002'
      and user_id = '10000000-0000-0000-0000-000000000003';
    set constraints all immediate;
  $$,
  'P0001',
  null,
  'não é possível deixar uma organização sem owner ativo'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.clients $$,
  '42501',
  null,
  'usuário anônimo não lê dados privados'
);

reset role;

select * from finish();

rollback;
