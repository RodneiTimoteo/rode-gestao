begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table security_test_ids (key text primary key, id uuid not null);
grant select, insert, update on table security_test_ids to authenticated;

insert into auth.users (id, email) values
('17000000-0000-4000-8000-000000000001', 'owner@stage4b1-security.test'),
('17000000-0000-4000-8000-000000000002', 'member@stage4b1-security.test');
insert into public.organizations (id, name, slug) values
('27000000-0000-4000-8000-000000000001', 'Stage 4B1 Security', 'stage-4b1-security');
insert into public.organization_members (organization_id, user_id, role, status, created_by, joined_at) values
('27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', 'owner', 'active', '17000000-0000-4000-8000-000000000001', now()),
('27000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000002', 'member', 'active', '17000000-0000-4000-8000-000000000001', now());
insert into public.clients (id, organization_id, name, created_by) values
('37000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'Cliente Security', '17000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok($$
  insert into security_test_ids(key, id)
  select 'proposal', public.save_proposal_options_draft(
    '27000000-0000-4000-8000-000000000001', null,
    '37000000-0000-4000-8000-000000000001', null,
    'SeguranÃ§a de valores derivados', null, null, null, null, null, '[]'::jsonb,
    '[{"name":"A","items":[{"service_name":"A","description":"A","quantity":1,"unit_price":10,"discount_amount":0}]},{"name":"B","items":[{"service_name":"B","description":"B","quantity":1,"unit_price":20,"discount_amount":0}]}]'::jsonb)
$$, 'cria proposta para testes diretos sob RLS');

select throws_ok($$
  update public.proposals
  set subtotal_amount=999, discount_amount=0, total_amount=999
  where id=(select id from security_test_ids where key='proposal')
$$, '42501', null, 'member nÃ£o sobrescreve totais calculados da proposta');

select throws_ok($$
  update public.proposal_options
  set subtotal_amount=999, discount_amount=0, total_amount=999
  where proposal_id=(select id from security_test_ids where key='proposal') and name='A'
$$, '42501', null, 'member nÃ£o sobrescreve totais calculados da opÃ§Ã£o');

select lives_ok($$
  update public.proposal_items
  set unit_price=25
  where proposal_id=(select id from security_test_ids where key='proposal')
    and option_id=(select id from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='A')
$$, 'ediÃ§Ã£o direta permitida no rascunho passa pelos gatilhos');
select is(
  (select total_amount from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='A'),
  25.00::numeric,
  'total da opÃ§Ã£o Ã© recalculado apÃ³s manipulaÃ§Ã£o direta do item'
);

select lives_ok($$update public.proposals set status='sent' where id=(select id from security_test_ids where key='proposal')$$, 'envia proposta protegida');
select lives_ok($$
  select public.select_proposal_option(
    (select id from security_test_ids where key='proposal'),
    (select id from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='A')
  )
$$, 'seleciona a opÃ§Ã£o recalculada');
select is((select total_amount from public.proposals where id=(select id from security_test_ids where key='proposal')), 25.00::numeric, 'proposta copia o total oficial selecionado');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.approve_proposal((select id from security_test_ids where key='proposal'))$$, 'owner aprova a opÃ§Ã£o escolhida');

select throws_ok($$
  update public.proposals
  set selected_option_id=(select id from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='B')
  where id=(select id from security_test_ids where key='proposal')
$$, 'P0001', 'terminal proposals are immutable; create a revision', 'seleÃ§Ã£o nÃ£o pode ser trocada apÃ³s aprovaÃ§Ã£o');

select lives_ok($$
  update public.proposal_items
  set unit_price=999
  where proposal_id=(select id from security_test_ids where key='proposal')
$$, 'RLS filtra atualizaÃ§Ã£o direta de itens da proposta aprovada');
select is(
  (select total_amount from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='A'),
  25.00::numeric,
  'itens e total contratado permanecem imutÃ¡veis depois da aprovaÃ§Ã£o'
);

select throws_ok($$
  insert into public.proposal_items (
    organization_id, proposal_id, option_id, position,
    service_name_snapshot, description, quantity, unit_price, discount_amount
  ) values (
    '27000000-0000-4000-8000-000000000001',
    (select id from security_test_ids where key='proposal'),
    (select id from public.proposal_options where proposal_id=(select id from security_test_ids where key='proposal') and name='B'),
    2, 'InvasÃ£o', 'InvasÃ£o', 1, 1, 0
  )
$$, 'P0001', 'proposal items can only be changed in draft proposals', 'Banco bloqueia inclusao direta de item apos aprovacao');

reset role;
select * from finish();
rollback;

