begin;

create extension if not exists pgtap with schema extensions;
select plan(51);

insert into auth.users (id, email) values
  ('12000000-0000-4000-8000-000000000001', 'owner-a@stage4c.test'),
  ('12000000-0000-4000-8000-000000000002', 'admin-a@stage4c.test'),
  ('12000000-0000-4000-8000-000000000003', 'member-a@stage4c.test'),
  ('12000000-0000-4000-8000-000000000004', 'owner-b@stage4c.test'),
  ('12000000-0000-4000-8000-000000000005', 'external@stage4c.test');

insert into public.organizations (id, name, slug) values
  ('22000000-0000-4000-8000-000000000001', 'Stage 4C A', 'stage-4c-a'),
  ('22000000-0000-4000-8000-000000000002', 'Stage 4C B', 'stage-4c-b');

insert into public.organization_members (organization_id, user_id, role, status, created_by, joined_at) values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'owner', 'active', '12000000-0000-4000-8000-000000000001', now()),
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'admin', 'active', '12000000-0000-4000-8000-000000000001', now()),
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'member', 'active', '12000000-0000-4000-8000-000000000001', now()),
  ('22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000004', 'owner', 'active', '12000000-0000-4000-8000-000000000004', now());

insert into public.clients (id, organization_id, name, created_by) values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Cliente A', '12000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'Cliente B', '12000000-0000-4000-8000-000000000004');

insert into public.proposals (id, organization_id, client_id, title, proposal_format, created_by) values
  ('52000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Proposta simples aprovada', 'simple', '12000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Proposta com opções', 'options', '12000000-0000-4000-8000-000000000001'),
  ('52000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Rascunho proibido', 'simple', '12000000-0000-4000-8000-000000000001');

insert into public.proposal_options (id, organization_id, proposal_id, name, position, created_by) values
  ('53000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Essencial', 1, '12000000-0000-4000-8000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Completa', 2, '12000000-0000-4000-8000-000000000001');

insert into public.proposal_items (id, organization_id, proposal_id, option_id, position, service_name_snapshot, description, quantity, unit_price, discount_amount, created_by) values
  ('62000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', null, 1, 'Consultoria', 'Escopo simples', 2, 500, 100, '12000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', null, 1, 'Implantação', 'Item comum', 1, 100, 0, '12000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', 1, 'Essencial', 'Item não escolhido', 1, 200, 0, '12000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 1, 'Completa', 'Item escolhido', 1, 500, 50, '12000000-0000-4000-8000-000000000001'),
  ('62000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', null, 1, 'Rascunho', 'Não aprovado', 1, 10, 0, '12000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.proposals set status = 'sent' where id in ('52000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002');
select public.approve_proposal('52000000-0000-4000-8000-000000000001');
select public.approve_proposal_option('52000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_manual_project('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Projeto manual', 'Escopo', '12000000-0000-4000-8000-000000000003', '2026-10-20', '2026-12-20', 1500) $$,
  'member ativo cria projeto manual'
);
select is((select status from public.projects where name = 'Projeto manual'), 'planning', 'projeto inicia em planejamento');
select is((select original_expected_end_date from public.projects where name = 'Projeto manual'), '2026-12-20'::date, 'prazo original nasce igual ao prazo atual');
select is((select contracted_amount from public.projects where name = 'Projeto manual'), 1500.00::numeric, 'valor manual não é sobrescrito pelo trigger');
select is((select count(*)::bigint from public.project_events where project_id = (select id from public.projects where name = 'Projeto manual') and event_type = 'created'), 1::bigint, 'criação manual registra evento');
select throws_ok(
  $$ select public.create_manual_project('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'Cliente externo', null, null, null, null, null) $$,
  'P0001', 'client not found in organization', 'cliente de outra organização é rejeitado'
);
select throws_ok(
  $$ select public.create_manual_project('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Responsável externo', null, '12000000-0000-4000-8000-000000000004', null, null, null) $$,
  'P0001', 'project owner must be an active member of the organization', 'responsável externo é rejeitado'
);

select ok(((public.create_project_from_proposal('22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Projeto simples', null, null, null, '2026-12-20'))->>'created')::boolean, 'proposta simples aprovada cria projeto');
select is((select contracted_amount from public.projects where proposal_id = '52000000-0000-4000-8000-000000000001'), 900.00::numeric, 'valor da proposta simples é preservado');
select is(jsonb_array_length((select proposal_snapshot->'items' from public.projects where proposal_id = '52000000-0000-4000-8000-000000000001')), 1, 'snapshot simples preserva seus itens');
select isnt(((public.create_project_from_proposal('22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Duplicado', null, null, null, null))->>'created')::boolean, true, 'segunda solicitação retorna o projeto existente');
select is((select count(*)::bigint from public.projects where proposal_id = '52000000-0000-4000-8000-000000000001'), 1::bigint, 'unicidade concorrente mantém um projeto por proposta');

select ok(((public.create_project_from_proposal('22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Projeto opção', null, null, null, null))->>'created')::boolean, 'proposta com alternativa selecionada cria projeto');
select is((select proposal_snapshot->'selected_option'->>'name' from public.projects where proposal_id = '52000000-0000-4000-8000-000000000002'), 'Completa', 'snapshot preserva somente a opção selecionada');
select is(jsonb_array_length((select proposal_snapshot->'items' from public.projects where proposal_id = '52000000-0000-4000-8000-000000000002')), 2, 'snapshot contém item comum e item da opção escolhida');
select throws_ok(
  $$ select public.create_project_from_proposal('22000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', 'Projeto indevido', null, null, null, null) $$,
  'P0001', 'projects can only be created from approved proposals', 'proposta não aprovada é bloqueada'
);

select ok(not has_column_privilege('authenticated', 'public.projects', 'status', 'update'), 'status não possui UPDATE direto');
select ok(not has_column_privilege('authenticated', 'public.projects', 'owner_user_id', 'update'), 'responsável não possui UPDATE direto');
select ok(not has_table_privilege('authenticated', 'public.project_events', 'insert'), 'histórico não permite INSERT direto');
select ok(not has_table_privilege('authenticated', 'public.project_events', 'update'), 'histórico não permite UPDATE direto');
select ok(not has_table_privilege('authenticated', 'public.project_events', 'delete'), 'histórico não permite DELETE direto');
select throws_ok(
  $$ update public.project_events set description = 'Histórico adulterado' where project_id = (select id from public.projects where name = 'Projeto manual') $$,
  '42501', null, 'usuário comum não altera histórico diretamente'
);
select throws_ok(
  $$ delete from public.project_events where project_id = (select id from public.projects where name = 'Projeto manual') $$,
  '42501', null, 'usuário comum não exclui histórico diretamente'
);
select throws_ok(
  $$ delete from public.projects where name = 'Projeto manual' $$,
  '42501', null, 'usuário comum não alcança o cascade do histórico pela exclusão do projeto'
);

reset role;
alter table public.projects disable trigger projects_identity_immutable;
select throws_ok(
  $$ update public.projects set organization_id = '22000000-0000-4000-8000-000000000002' where name = 'Projeto simples' $$,
  'P0001', 'project organization is immutable', 'prepare_project protege a organização mesmo sem o trigger genérico'
);
select throws_ok(
  $$ update public.projects set client_id = '32000000-0000-4000-8000-000000000002' where name = 'Projeto simples' $$,
  'P0001', 'project client is immutable', 'prepare_project protege o cliente mesmo sem o trigger genérico'
);
select throws_ok(
  $$ update public.projects set proposal_id = '52000000-0000-4000-8000-000000000002' where name = 'Projeto simples' $$,
  'P0001', 'project proposal is immutable', 'prepare_project protege a proposta mesmo sem o trigger genérico'
);
alter table public.projects enable trigger projects_identity_immutable;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$ select public.change_project_status((select id from public.projects where name = 'Projeto manual'), 'paused', '   ') $$,
  'P0001', 'status justification is required', 'pausa exige justificativa'
);
select lives_ok($$ select public.change_project_status((select id from public.projects where name = 'Projeto manual'), 'paused', 'Dependência externa') $$, 'transição válida para pausado');
select is((select justification from public.project_events where project_id = (select id from public.projects where name = 'Projeto manual') and event_type = 'status_changed' order by occurred_at desc limit 1), 'Dependência externa', 'histórico preserva justificativa da situação');
select throws_ok(
  $$ select public.change_project_status((select id from public.projects where name = 'Projeto manual'), 'completed', null) $$,
  'P0001', 'invalid project status transition from paused to completed', 'transição inválida é bloqueada no banco'
);
select lives_ok($$ select public.change_project_status((select id from public.projects where name = 'Projeto manual'), 'in_progress', null) $$, 'projeto pausado volta para andamento');
select lives_ok($$ select public.change_project_status((select id from public.projects where name = 'Projeto manual'), 'completed', null) $$, 'projeto em andamento pode ser concluído');
select ok((select completed_at is not null from public.projects where name = 'Projeto manual'), 'conclusão registra data efetiva');
select throws_ok(
  $$ select public.assign_project_owner((select id from public.projects where name = 'Projeto manual'), '12000000-0000-4000-8000-000000000002') $$,
  'P0001', 'terminal projects are immutable', 'projeto concluído não troca responsável'
);

select lives_ok($$ select public.change_project_status((select id from public.projects where name = 'Projeto opção'), 'cancelled', 'Encerramento autorizado') $$, 'projeto em planejamento pode ser cancelado');
select is((select count(*)::bigint from public.project_events where project_id = (select id from public.projects where name = 'Projeto opção')), 2::bigint, 'cancelamento preserva criação e acrescenta evento sem excluir histórico');

select lives_ok($$ select public.change_project_deadline((select id from public.projects where name = 'Projeto simples'), '2027-01-20', 'Solicitação formal do cliente') $$, 'prazo atual muda atomicamente');
select is((select original_expected_end_date from public.projects where name = 'Projeto simples'), '2026-12-20'::date, 'alteração mantém o prazo original');
select is((select expected_end_date from public.projects where name = 'Projeto simples'), '2027-01-20'::date, 'novo prazo é salvo como prazo atual');
select is((select justification from public.project_events where project_id = (select id from public.projects where name = 'Projeto simples') and event_type = 'deadline_changed'), 'Solicitação formal do cliente', 'histórico de prazo preserva justificativa');
select is((select event_data->>'from' from public.project_events where project_id = (select id from public.projects where name = 'Projeto simples') and event_type = 'deadline_changed'), '2026-12-20', 'histórico registra o prazo anterior');
select is((select event_data->>'to' from public.project_events where project_id = (select id from public.projects where name = 'Projeto simples') and event_type = 'deadline_changed'), '2027-01-20', 'histórico registra o novo prazo');
select throws_ok(
  $$ select public.change_project_deadline((select id from public.projects where name = 'Projeto simples'), '2027-02-20', '  ') $$,
  'P0001', 'deadline justification is required', 'justificativa vazia de prazo é rejeitada'
);
select throws_ok(
  $$ update public.projects set expected_end_date = '2028-01-01' where name = 'Projeto simples' $$,
  '42501', null, 'prazo não pode ser alterado diretamente pela Data API'
);
select lives_ok($$ select public.assign_project_owner((select id from public.projects where name = 'Projeto simples'), '12000000-0000-4000-8000-000000000002') $$, 'responsável ativo da organização pode ser atribuído');
select is((select count(*)::bigint from public.project_events where project_id = (select id from public.projects where name = 'Projeto simples') and event_type = 'owner_changed'), 1::bigint, 'mudança de responsável registra histórico');
select throws_ok(
  $$ select public.assign_project_owner((select id from public.projects where name = 'Projeto simples'), '12000000-0000-4000-8000-000000000004') $$,
  'P0001', 'project owner must be an active member of the organization', 'responsável de outra organização é rejeitado'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::bigint from public.projects), 0::bigint, 'RLS não expõe projetos de outra organização');
select is((select count(*)::bigint from public.project_events), 0::bigint, 'RLS não expõe histórico de outra organização');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$ select public.create_manual_project('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Invasão', null, null, null, null, null) $$,
  '42501', 'project access denied', 'usuário externo não cria projeto'
);

reset role;
set constraints all immediate;
select * from finish();
rollback;
