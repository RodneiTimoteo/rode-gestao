begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

create temporary table test_ids (key text primary key, id uuid not null);
grant select, insert, update on table test_ids to authenticated;

insert into auth.users (id, email) values
('12000000-0000-4000-8000-000000000001','owner-a@stage4b-functions.test'),
('12000000-0000-4000-8000-000000000002','member-a@stage4b-functions.test'),
('12000000-0000-4000-8000-000000000003','owner-b@stage4b-functions.test');
insert into public.organizations (id,name,slug) values
('22000000-0000-4000-8000-000000000001','Stage 4B Functions A','stage-4b-functions-a'),
('22000000-0000-4000-8000-000000000002','Stage 4B Functions B','stage-4b-functions-b');
insert into public.organization_members (organization_id,user_id,role,status,created_by,joined_at) values
('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner','active','12000000-0000-4000-8000-000000000001',now()),
('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','member','active','12000000-0000-4000-8000-000000000001',now()),
('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000003','owner','active','12000000-0000-4000-8000-000000000003',now());
insert into public.clients (id,organization_id,name,created_by) values
('32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Cliente Functions A','12000000-0000-4000-8000-000000000001'),
('32000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','Cliente Functions B','12000000-0000-4000-8000-000000000003');
insert into public.pipeline_stages (id,organization_id,key,name,position) values
('43000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','aberta','Aberta',1),
('43000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','aberta','Aberta',1);
insert into public.opportunities (id,organization_id,client_id,pipeline_stage_id,title,created_by) values
('44000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','Oportunidade A','12000000-0000-4000-8000-000000000001'),
('44000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000002','Oportunidade B','12000000-0000-4000-8000-000000000003');
insert into public.services (id,organization_id,name,description,reference_price,created_by) values
('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Serviço Functions A','Descrição A',500,'12000000-0000-4000-8000-000000000001'),
('42000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','Serviço Functions B','Descrição B',900,'12000000-0000-4000-8000-000000000003');
insert into public.proposals (id,organization_id,client_id,opportunity_id,title,created_by) values
('52000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-000000000002','Proposta isolada B','12000000-0000-4000-8000-000000000003');
insert into public.proposal_items (
  id, organization_id, proposal_id, position, service_name_snapshot,
  description, quantity, unit_price, discount_amount, created_by
) values (
  '62000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000002', 1,
  'Item isolado B', 'Mantém a fixture estruturalmente válida', 1, 10, 0,
  '12000000-0000-4000-8000-000000000003'
);

select ok(has_function_privilege('authenticated','public.save_proposal_draft(uuid,uuid,uuid,uuid,text,date,text,text,text,text,jsonb)','execute'),'authenticated executa save_proposal_draft');
select ok(has_function_privilege('authenticated','public.create_proposal_revision(uuid)','execute'),'authenticated executa create_proposal_revision');

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$
 insert into test_ids(key,id) select 'proposal',public.save_proposal_draft(
 '22000000-0000-4000-8000-000000000001',null,'32000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001',
 'Título comercial original','2026-12-31','50% na entrada','30 dias',null,null,
 '[{"service_id":"42000000-0000-4000-8000-000000000001","service_name":"Serviço A snapshot","description":"Primeiro item","quantity":2,"unit_price":500,"discount_amount":50},{"service_id":null,"service_name":"Item personalizado","description":"Segundo item","quantity":1,"unit_price":100,"discount_amount":0}]'::jsonb)
$$,'member salva cabeçalho e itens do rascunho em uma transação');
select is((select count(*)::bigint from test_ids where key='proposal'),1::bigint,'RPC retorna e registra o UUID da proposta criada');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from test_ids where key='proposal')),2::bigint,'criação persiste todos os itens');
select is((select subtotal_amount from public.proposals where id=(select id from test_ids where key='proposal')),1100.00::numeric,'subtotal deriva dos itens');
select is((select discount_amount from public.proposals where id=(select id from test_ids where key='proposal')),50.00::numeric,'desconto deriva dos itens');
select is((select total_amount from public.proposals where id=(select id from test_ids where key='proposal')),1050.00::numeric,'total deriva dos itens');
select is((select service_name_snapshot from public.proposal_items where proposal_id=(select id from test_ids where key='proposal') and position=1),'Serviço A snapshot','item preserva o snapshot comercial informado');
select is((select opportunity_id from public.proposals where id=(select id from test_ids where key='proposal')),'44000000-0000-4000-8000-000000000001'::uuid,'criação preserva a oportunidade do CRM');

select lives_ok($$
 select public.save_proposal_draft('22000000-0000-4000-8000-000000000001',(select id from test_ids where key='proposal'),'32000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','Título compartilhado',null,null,null,'Observação preservada',null,'[{"service_id":null,"service_name":"Item substituto","description":"Versão atual","quantity":3,"unit_price":100,"discount_amount":30}]'::jsonb)
$$,'edição substitui cabeçalho e itens atomicamente');
select is((select title from public.proposals where id=(select id from test_ids where key='proposal')),'Título compartilhado','edição atualiza o cabeçalho pelo UUID');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from test_ids where key='proposal')),1::bigint,'edição remove os itens anteriores');
select is((select total_amount from public.proposals where id=(select id from test_ids where key='proposal')),270.00::numeric,'edição recalcula o total oficial');
select is((select position from public.proposal_items where proposal_id=(select id from test_ids where key='proposal')),1,'edição normaliza as posições');

select throws_ok($$
 select public.save_proposal_draft('22000000-0000-4000-8000-000000000001',(select id from test_ids where key='proposal'),'32000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','Alteração que deve reverter',null,null,null,null,null,'[{"service_id":null,"service_name":"Item temporário","description":"Deve reverter","quantity":1,"unit_price":1,"discount_amount":0},{"service_id":"42000000-0000-4000-8000-000000000002","service_name":"Serviço cruzado","description":"Inválido","quantity":1,"unit_price":1,"discount_amount":0}]'::jsonb)
$$,'23503',null,'falha em um item reverte toda a edição');
select is((select title from public.proposals where id=(select id from test_ids where key='proposal')),'Título compartilhado','rollback preserva o cabeçalho');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from test_ids where key='proposal')),1::bigint,'rollback preserva os itens');
select is((select total_amount from public.proposals where id=(select id from test_ids where key='proposal')),270.00::numeric,'rollback preserva o total');
select throws_ok($$
 select public.save_proposal_draft('22000000-0000-4000-8000-000000000001',null,'32000000-0000-4000-8000-000000000001',null,'Criação que deve reverter',null,null,null,null,null,'[{"service_id":null,"service_name":"Item válido","description":"Primeiro","quantity":1,"unit_price":10,"discount_amount":0},{"service_id":"42000000-0000-4000-8000-000000000002","service_name":"Item inválido","description":"Segundo","quantity":1,"unit_price":10,"discount_amount":0}]'::jsonb)
$$,'23503',null,'falha em item reverte também proposta nova');
select is((select count(*)::bigint from public.proposals where organization_id='22000000-0000-4000-8000-000000000001'),1::bigint,'falha não deixa cabeçalho órfão');
select throws_ok($$
 select public.save_proposal_draft('22000000-0000-4000-8000-000000000001',(select id from test_ids where key='proposal'),'32000000-0000-4000-8000-000000000002',null,'Cliente alterado',null,null,null,null,null,'[{"service_id":null,"service_name":"Item","description":"Item","quantity":1,"unit_price":1,"discount_amount":0}]'::jsonb)
$$,'P0001','simple draft proposal not found or access denied','edição não troca o cliente imutável');
select is((select client_id from public.proposals where id=(select id from test_ids where key='proposal')),'32000000-0000-4000-8000-000000000001'::uuid,'cliente original permanece íntegro');
select throws_ok($$
 select public.save_proposal_draft('22000000-0000-4000-8000-000000000002',null,'32000000-0000-4000-8000-000000000002',null,'Tentativa cruzada',null,null,null,null,null,'[{"service_id":"42000000-0000-4000-8000-000000000002","service_name":"Serviço B","description":"Inválido","quantity":1,"unit_price":1,"discount_amount":0}]'::jsonb)
$$,'42501',null,'member não cria rascunho em outra organização');
select lives_ok($$update public.proposals set status='sent' where id=(select id from test_ids where key='proposal')$$,'member envia o rascunho');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.approve_proposal((select id from test_ids where key='proposal'))$$,'owner aprova a proposta original');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$insert into test_ids(key,id) select 'revision',public.create_proposal_revision((select id from test_ids where key='proposal'))$$,'member cria revisão transacional');
select is((select count(*)::bigint from public.proposals where supersedes_proposal_id=(select id from test_ids where key='proposal')),1::bigint,'criação gera somente uma revisão');
select is((select revision_number from public.proposals where id=(select id from test_ids where key='revision')),2,'revisão recebe o próximo número');
select is((select count(*)::bigint from public.proposal_items where proposal_id=(select id from test_ids where key='revision')),1::bigint,'revisão copia todos os itens');
select is((select total_amount from public.proposals where id=(select id from test_ids where key='revision')),270.00::numeric,'revisão mantém o total');
select is((select status from public.proposals where id=(select id from test_ids where key='revision')),'draft','revisão nasce rascunho');
select is((select title from public.proposals where id=(select id from test_ids where key='revision')),(select title from public.proposals where id=(select id from test_ids where key='proposal')),'títulos iguais não identificam original e revisão');
select is((select revision_group_id from public.proposals where id=(select id from test_ids where key='revision')),(select revision_group_id from public.proposals where id=(select id from test_ids where key='proposal')),'revisão preserva o grupo');
select is((select client_id from public.proposals where id=(select id from test_ids where key='revision')),(select client_id from public.proposals where id=(select id from test_ids where key='proposal')),'revisão preserva o cliente');
select is((select opportunity_id from public.proposals where id=(select id from test_ids where key='revision')),(select opportunity_id from public.proposals where id=(select id from test_ids where key='proposal')),'revisão preserva a oportunidade');
select is(
 (select jsonb_agg(jsonb_build_object('service_id',service_id,'name',service_name_snapshot,'description',description,'quantity',quantity,'unit_price',unit_price,'discount',discount_amount) order by position) from public.proposal_items where proposal_id=(select id from test_ids where key='revision')),
 (select jsonb_agg(jsonb_build_object('service_id',service_id,'name',service_name_snapshot,'description',description,'quantity',quantity,'unit_price',unit_price,'discount',discount_amount) order by position) from public.proposal_items where proposal_id=(select id from test_ids where key='proposal')),
 'revisão preserva o snapshot integral dos itens');
select throws_ok($$select public.create_proposal_revision((select id from test_ids where key='proposal'))$$,'23505',null,'unicidade impede revisão direta duplicada');
select is((select count(*)::bigint from public.proposals where supersedes_proposal_id=(select id from test_ids where key='proposal')),1::bigint,'falha duplicada não deixa revisão parcial');
select throws_ok($$select public.create_proposal_revision((select id from test_ids where key='revision'))$$,'P0001','terminal proposal not found or access denied','rascunho não origina revisão');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$update public.proposals set status='sent' where id='52000000-0000-4000-8000-000000000002'$$,'owner B envia sua proposta');
select lives_ok($$select public.approve_proposal('52000000-0000-4000-8000-000000000002')$$,'owner B prepara proposta terminal');
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.create_proposal_revision('52000000-0000-4000-8000-000000000002')$$,'P0001','terminal proposal not found or access denied','member não cria revisão em outra organização');
reset role;
select is((select count(*)::bigint from public.proposals where organization_id='22000000-0000-4000-8000-000000000002'),1::bigint,'tentativas cruzadas não criam dados na organização B');
set constraints all immediate;
select * from finish();
rollback;
