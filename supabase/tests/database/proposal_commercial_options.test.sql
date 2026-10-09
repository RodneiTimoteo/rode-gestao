begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create temporary table option_test_ids (key text primary key, id uuid not null);
grant select, insert, update on table option_test_ids to authenticated;

insert into auth.users (id, email) values
('16000000-0000-4000-8000-000000000001', 'owner-a@stage4b1.test'),
('16000000-0000-4000-8000-000000000002', 'member-a@stage4b1.test'),
('16000000-0000-4000-8000-000000000003', 'owner-b@stage4b1.test'),
('16000000-0000-4000-8000-000000000004', 'suspended-a@stage4b1.test'),
('16000000-0000-4000-8000-000000000005', 'external@stage4b1.test');
insert into public.organizations (id, name, slug) values
('26000000-0000-4000-8000-000000000001', 'Stage 4B1 A', 'stage-4b1-a'),
('26000000-0000-4000-8000-000000000002', 'Stage 4B1 B', 'stage-4b1-b');
insert into public.organization_members (organization_id, user_id, role, status, created_by, joined_at) values
('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'owner', 'active', '16000000-0000-4000-8000-000000000001', now()),
('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'member', 'active', '16000000-0000-4000-8000-000000000001', now()),
('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000004', 'member', 'suspended', '16000000-0000-4000-8000-000000000001', now()),
('26000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000003', 'owner', 'active', '16000000-0000-4000-8000-000000000003', now());
insert into public.clients (id, organization_id, name, created_by) values
('36000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Cliente A', '16000000-0000-4000-8000-000000000001'),
('36000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000002', 'Cliente B', '16000000-0000-4000-8000-000000000003');
insert into public.services (id, organization_id, name, description, reference_price, created_by) values
('46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Serviço A', 'A', 100, '16000000-0000-4000-8000-000000000001'),
('46000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000002', 'Serviço B', 'B', 100, '16000000-0000-4000-8000-000000000003');

select has_table('public', 'proposal_options', 'proposal_options existe');
select has_column('public', 'proposals', 'proposal_format', 'propostas distinguem o formato');
select has_column('public', 'proposals', 'selected_option_id', 'propostas registram a escolha');
select has_column('public', 'proposal_items', 'option_id', 'itens podem pertencer a uma opção');
select has_function(
  'public',
  'save_proposal_options_draft',
  array['uuid','uuid','uuid','uuid','text','date','text','text','text','text','jsonb','jsonb'],
  'RPC de gravação existe'
);
select has_function(
  'public',
  'select_proposal_option',
  array['uuid','uuid'],
  'RPC de seleção existe'
);
select has_function(
  'public',
  'approve_proposal_option',
  array['uuid','uuid'],
  'RPC de aprovação atômica existe'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$
  insert into option_test_ids(key, id)
  select 'tenant-b', public.save_proposal_options_draft(
    '26000000-0000-4000-8000-000000000002', null, '36000000-0000-4000-8000-000000000002', null,
    'Proposta B', null, null, null, null, null, '[]'::jsonb,
    '[{"name":"B1","items":[{"service_name":"B1","description":"B1","quantity":1,"unit_price":10,"discount_amount":0}]},{"name":"B2","items":[{"service_name":"B2","description":"B2","quantity":1,"unit_price":20,"discount_amount":0}]}]'::jsonb)
$$, 'owner B cria proposta isolada');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$
  insert into option_test_ids(key, id)
  select 'proposal', public.save_proposal_options_draft(
    '26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null,
    'Proposta com opções', '2027-01-31', '30 dias', '15 dias', null, null,
    '[{"service_name":"Comum","description":"Implantação","quantity":1,"unit_price":100,"discount_amount":10}]'::jsonb,
    '[{"name":"Essencial","description":"Entrada","items":[{"service_name":"A","description":"Escopo A","quantity":2,"unit_price":100,"discount_amount":20}]},{"name":"Completa","description":"Expansão","items":[{"service_name":"B","description":"Escopo B","quantity":2,"unit_price":200,"discount_amount":0}]}]'::jsonb)
$$, 'member cria duas alternativas atomicamente');
select is((select proposal_format from public.proposals where id=(select id from option_test_ids where key='proposal')), 'options', 'formato é persistido');
select is((select count(*)::bigint from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal')), 2::bigint, 'duas opções são persistidas');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from option_test_ids where key='proposal') and option_id is null), 1::bigint, 'item comum não é duplicado');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from option_test_ids where key='proposal') and option_id is not null), 2::bigint, 'itens exclusivos pertencem às opções');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='proposal')), null::numeric, 'alternativas não são somadas antes da escolha');
select is((select subtotal_amount from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Essencial'), 300.00::numeric, 'subtotal da opção inclui item comum');
select is((select discount_amount from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Essencial'), 30.00::numeric, 'desconto da opção inclui item comum');
select is((select total_amount from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Essencial'), 270.00::numeric, 'total da primeira opção é calculado no banco');
select is((select total_amount from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Completa'), 490.00::numeric, 'total da segunda opção é independente');
select ok(
  lower(pg_get_functiondef('public.select_proposal_option(uuid,uuid)'::regprocedure)) like '%for update%',
  'seleção serializa concorrência no registro da proposta'
);
select ok(
  lower(pg_get_functiondef('public.approve_proposal_option(uuid,uuid)'::regprocedure)) like '%for update%',
  'aprovação usa o mesmo bloqueio de concorrência'
);

select throws_ok($$
  select public.save_proposal_options_draft('26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null, 'Uma opção', null, null, null, null, null, '[]'::jsonb,
  '[{"name":"Única","items":[{"service_name":"X","description":"X","quantity":1,"unit_price":1}]}]'::jsonb)
$$, 'P0001', 'options proposal must contain two or three options', 'uma opção é rejeitada');
select throws_ok($$
  select public.save_proposal_options_draft('26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null, 'Quatro opções', null, null, null, null, null, '[]'::jsonb,
  '[{"name":"1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":1}]},{"name":"3","items":[{"service_name":"3","description":"3","quantity":1,"unit_price":1}]},{"name":"4","items":[{"service_name":"4","description":"4","quantity":1,"unit_price":1}]}]'::jsonb)
$$, 'P0001', 'options proposal must contain two or three options', 'quatro opções são rejeitadas');
select throws_ok($$
  select public.save_proposal_options_draft('26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null, 'Nomes repetidos', null, null, null, null, null, '[]'::jsonb,
  '[{"name":"Igual","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"igual","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":1}]}]'::jsonb)
$$, '23505', null, 'nomes de opções são únicos sem diferenciar caixa');

select throws_ok($$
  select public.save_proposal_options_draft('26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null, 'Falha atômica', null, null, null, null, null,
  '[{"service_id":"46000000-0000-4000-8000-000000000002","service_name":"Cruzado","description":"Inválido","quantity":1,"unit_price":10}]'::jsonb,
  '[{"name":"1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":1}]}]'::jsonb)
$$, '23503', null, 'serviço de outra organização aborta a operação');
select is((select count(*)::bigint from public.proposals where title='Falha atômica'), 0::bigint, 'falha não deixa proposta ou opções parciais');

select lives_ok($$
  insert into option_test_ids(key, id)
  select 'other-proposal', public.save_proposal_options_draft(
    '26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null,
    'Outra proposta', null, null, null, null, null, '[]'::jsonb,
    '[{"name":"Outra 1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"Outra 2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":2}]}]'::jsonb)
$$, 'proposta auxiliar permite testar vínculo cruzado');

select lives_ok($$update public.proposals set status='sent' where id=(select id from option_test_ids where key='proposal')$$, 'member envia proposta completa');
select throws_ok($$select public.approve_proposal((select id from option_test_ids where key='proposal'))$$, 'P0001', null, 'member não aprova proposta');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.approve_proposal((select id from option_test_ids where key='proposal'))$$, 'P0001', 'an option must be selected before approving an options proposal', 'owner não aprova sem escolha');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.select_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='other-proposal') and position=1))$$, 'P0001', 'selected option does not belong to proposal', 'UUID de opção de outra proposta é rejeitado');
select lives_ok($$select public.select_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Completa'))$$, 'member seleciona uma opção enviada');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='proposal')), 490.00::numeric, 'proposta assume somente o total selecionado');
select is((select count(*)::bigint from public.proposal_events where proposal_id=(select id from option_test_ids where key='proposal') and event_type='option_selected'), 1::bigint, 'primeira escolha é auditada');
select lives_ok($$select public.select_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Essencial'))$$, 'member altera a escolha');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='proposal')), 270.00::numeric, 'troca atualiza o valor contratado');
select is((select count(*)::bigint from public.proposal_events where proposal_id=(select id from option_test_ids where key='proposal') and event_type='option_selection_changed'), 1::bigint, 'troca é auditada separadamente');
select lives_ok($$select public.select_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Essencial'))$$, 'repetir a escolha é idempotente');
select is((select count(*)::bigint from public.proposal_events where proposal_id=(select id from option_test_ids where key='proposal') and event_type in ('option_selected','option_selection_changed')), 2::bigint, 'idempotência não duplica auditoria');
select throws_ok($$select public.select_proposal_option((select id from option_test_ids where key='tenant-b'), '00000000-0000-4000-8000-000000000001')$$, 'P0001', 'proposal not found or access denied', 'RLS oculta proposta de outra organização');
select throws_ok($$select public.approve_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Completa'))$$, 'P0001', null, 'member não usa aprovação atômica');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.approve_proposal_option((select id from option_test_ids where key='proposal'), (select id from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and name='Completa'))$$, 'owner seleciona e aprova sob o mesmo lock');
select is((select status from public.proposals where id=(select id from option_test_ids where key='proposal')), 'approved', 'status aprovado é persistido');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='proposal')), 490.00::numeric, 'aprovação congela o valor da opção escolhida');
select lives_ok($$update public.proposal_options set name='Mutação' where proposal_id=(select id from option_test_ids where key='proposal') and name='Completa'$$, 'RLS filtra escrita direta em opção aprovada');
select is((select name from public.proposal_options where proposal_id=(select id from option_test_ids where key='proposal') and position=2), 'Completa', 'opção aprovada permanece imutável');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into option_test_ids(key, id) select 'revision', public.create_proposal_revision((select id from option_test_ids where key='proposal'))$$, 'member cria revisão da proposta aprovada');
select is((select proposal_format from public.proposals where id=(select id from option_test_ids where key='revision')), 'options', 'revisão preserva o formato');
select is((select count(*)::bigint from public.proposal_options where proposal_id=(select id from option_test_ids where key='revision')), 2::bigint, 'revisão copia as opções');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from option_test_ids where key='revision')), 3::bigint, 'revisão copia itens comuns e exclusivos');
select is((select selected_option_id from public.proposals where id=(select id from option_test_ids where key='revision')), null::uuid, 'revisão exige nova escolha');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='revision')), null::numeric, 'revisão não herda valor contratado');
select lives_ok($$
  insert into option_test_ids(key, id)
  select 'rejected', public.save_proposal_options_draft(
    '26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null,
    'Proposta rejeitada', null, null, null, null, null, '[]'::jsonb,
    '[{"name":"R1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"R2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":2}]}]'::jsonb)
$$, 'cria proposta que será rejeitada');
select lives_ok($$update public.proposals set status='sent' where id=(select id from option_test_ids where key='rejected')$$, 'envia proposta que será rejeitada');
select lives_ok($$update public.proposals set status='rejected', rejection_reason='Cliente adiou o projeto' where id=(select id from option_test_ids where key='rejected')$$, 'rejeição usa transição existente');
select is((select count(*)::bigint from public.proposal_options where proposal_id=(select id from option_test_ids where key='rejected')), 2::bigint, 'rejeição preserva alternativas');
select is((select count(*)::bigint from public.proposal_events where proposal_id=(select id from option_test_ids where key='rejected') and event_type='rejected'), 1::bigint, 'rejeição preserva histórico');
select lives_ok($$
  insert into option_test_ids(key, id)
  select 'three-options', public.save_proposal_options_draft(
    '26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null,
    'Três opções', null, null, null, null, null, '[]'::jsonb,
    '[{"name":"1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":2}]},{"name":"3","items":[{"service_name":"3","description":"3","quantity":1,"unit_price":3}]}]'::jsonb)
$$, 'três alternativas também são aceitas');
select is((select count(*)::bigint from public.proposal_options where proposal_id=(select id from option_test_ids where key='three-options')), 3::bigint, 'terceira opção é persistida sem ambiguidade');

select lives_ok($$
  insert into option_test_ids(key, id)
  select 'simple', public.save_proposal_draft(
    '26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null,
    'Proposta simples', null, null, null, null, null,
    '[{"service_name":"Simples","description":"Compatibilidade","quantity":2,"unit_price":50,"discount_amount":5}]'::jsonb)
$$, 'fluxo simples continua funcionando');
select is((select total_amount from public.proposals where id=(select id from option_test_ids where key='simple')), 95.00::numeric, 'total simples mantém a semântica anterior');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$
  select public.save_proposal_options_draft('26000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', null, 'Suspensa', null, null, null, null, null, '[]'::jsonb,
  '[{"name":"1","items":[{"service_name":"1","description":"1","quantity":1,"unit_price":1}]},{"name":"2","items":[{"service_name":"2","description":"2","quantity":1,"unit_price":2}]}]'::jsonb)
$$, 'P0001', null, 'membro suspenso não modifica dados');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"16000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::bigint from public.proposal_options), 0::bigint, 'usuário externo não acessa alternativas');

reset role;
select * from finish();
rollback;
