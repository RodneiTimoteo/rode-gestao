begin;

create extension if not exists pgtap with schema extensions;
select plan(140);

insert into auth.users (id, email) values
  ('13000000-0000-4000-8000-000000000001', 'owner-a@stage4c2.test'),
  ('13000000-0000-4000-8000-000000000002', 'member-a@stage4c2.test'),
  ('13000000-0000-4000-8000-000000000003', 'suspended-a@stage4c2.test'),
  ('13000000-0000-4000-8000-000000000004', 'owner-b@stage4c2.test'),
  ('13000000-0000-4000-8000-000000000005', 'external@stage4c2.test');

insert into public.profiles (id, display_name) values
  ('13000000-0000-4000-8000-000000000001', 'Owner A'),
  ('13000000-0000-4000-8000-000000000002', 'Member A'),
  ('13000000-0000-4000-8000-000000000003', 'Suspended A'),
  ('13000000-0000-4000-8000-000000000004', 'Owner B');

insert into public.organizations (id, name, slug) values
  ('23000000-0000-4000-8000-000000000001', 'Stage 4C2 A', 'stage-4c2-a'),
  ('23000000-0000-4000-8000-000000000002', 'Stage 4C2 B', 'stage-4c2-b');

insert into public.organization_members (
  organization_id, user_id, role, status, created_by, joined_at
) values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'owner', 'active', '13000000-0000-4000-8000-000000000001', now()),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'member', 'active', '13000000-0000-4000-8000-000000000001', now()),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', 'member', 'suspended', '13000000-0000-4000-8000-000000000001', null),
  ('23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000004', 'owner', 'active', '13000000-0000-4000-8000-000000000004', now());

insert into public.clients (id, organization_id, name, created_by) values
  ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Cliente A', '13000000-0000-4000-8000-000000000001'),
  ('33000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', 'Cliente B', '13000000-0000-4000-8000-000000000004');

insert into public.projects (
  id, organization_id, client_id, name, created_by
) values
  ('93000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'Projeto operacional', '13000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'Projeto vazio', '13000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000002', 'Projeto B', '13000000-0000-4000-8000-000000000004');

-- Estrutura, pos-condicao do backfill e privilegios minimos.
select ok(to_regclass('public.project_task_checklist_items') is not null, 'tabela de checklist existe');
select ok(to_regclass('public.project_progress') is not null, 'view de progresso do projeto existe');
select ok(to_regclass('public.project_stage_progress') is not null, 'view de progresso da etapa existe');
select is(
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'project_tasks' and column_name = 'project_stage_id'),
  'NO', 'tarefa passa a exigir etapa'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'project_tasks_stage_same_project_fk' and confdeltype = 'r'),
  'exclusao de etapa fica restrita pela FK de tarefas'
);
select ok(has_table_privilege('authenticated', 'public.project_stages', 'select'), 'authenticated le etapas');
select ok(not has_table_privilege('authenticated', 'public.project_stages', 'insert'), 'authenticated nao insere etapa diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_stages', 'update'), 'authenticated nao altera etapa diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_stages', 'delete'), 'authenticated nao exclui etapa diretamente');
select ok(has_table_privilege('authenticated', 'public.project_tasks', 'select'), 'authenticated le tarefas');
select ok(not has_table_privilege('authenticated', 'public.project_tasks', 'insert'), 'authenticated nao insere tarefa diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_tasks', 'update'), 'authenticated nao altera tarefa diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_tasks', 'delete'), 'authenticated nao exclui tarefa diretamente');
select ok(has_table_privilege('authenticated', 'public.project_task_checklist_items', 'select'), 'authenticated le checklist');
select ok(not has_table_privilege('authenticated', 'public.project_task_checklist_items', 'insert'), 'authenticated nao escreve checklist diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_task_checklist_items', 'update'), 'authenticated nao altera checklist diretamente');
select ok(not has_table_privilege('authenticated', 'public.project_task_checklist_items', 'delete'), 'authenticated nao exclui checklist diretamente');
select ok(has_table_privilege('authenticated', 'public.project_progress', 'select'), 'authenticated le progresso');
select ok(not has_table_privilege('anon', 'public.project_progress', 'select'), 'anon nao le progresso');
select ok(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.project_progress'::regclass),
  'view de progresso do projeto usa security_invoker'
);
select ok(
  lower(pg_get_functiondef('private.guard_project_child_mutation()'::regprocedure)) like '%for update%',
  'guard de filhos bloqueia o projeto pai durante a mutacao'
);
select ok(
  has_function_privilege('authenticated', 'public.create_project_stage(uuid,text,text,uuid,date,date)', 'execute'),
  'authenticated executa RPC de etapa'
);
select ok(
  has_function_privilege('authenticated', 'public.complete_project_task(uuid)', 'execute'),
  'authenticated executa RPC de conclusao'
);
select ok(
  not has_function_privilege('anon', 'public.complete_project_task(uuid)', 'execute'),
  'anon nao executa RPC de conclusao'
);
select ok(not has_table_privilege('authenticated', 'public.project_events', 'insert'), 'historico continua sem escrita direta');

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_project_stage(null, 'Sem projeto', null, null, null, null) $$,
  'P0001', 'project id is required', 'identificador obrigatorio de projeto nao aceita null'
);
select throws_ok(
  $$ select public.reorder_project_stages('93000000-0000-4000-8000-000000000002', null) $$,
  'P0001', 'ordered stage ids are required', 'array nulo de etapas e rejeitado'
);
select lives_ok(
  $$ select public.reorder_project_stages('93000000-0000-4000-8000-000000000002', '{}'::uuid[]) $$,
  'array vazio reordena projeto sem etapas'
);
reset role;
select lives_ok(
  $$ insert into public.project_stages (
    id, organization_id, project_id, name, position, created_by
  ) values (
    'a1000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000002',
    'Prova do trigger de etapa', 1,
    '13000000-0000-4000-8000-000000000002'
  ) $$,
  'guard aceita INSERT de etapa sem resolver campos de tarefa ou checklist'
);
select lives_ok(
  $$ update public.project_stages
     set description = 'UPDATE validado'
     where id = 'a1000000-0000-4000-8000-000000000001' $$,
  'guard aceita UPDATE de etapa e acessa OLD somente nesse caminho'
);
delete from public.project_stages where id = 'a1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000001', 'Descoberta', 'Planejamento inicial', '13000000-0000-4000-8000-000000000002', '2026-10-20', '2026-10-25') $$,
  'membro cria etapa no proprio projeto'
);
select lives_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000001', 'Execução', null, null, null, null) $$,
  'segunda etapa recebe posicao automaticamente'
);
select is(
  (select array_agg(name order by position) from public.project_stages where project_id = '93000000-0000-4000-8000-000000000001'),
  array['Descoberta', 'Execução']::text[], 'etapas nascem em ordem'
);
select is(
  (select count(*)::bigint from public.project_events where project_id = '93000000-0000-4000-8000-000000000001' and event_type = 'stage_created'),
  2::bigint, 'criacao de etapa registra eventos'
);
select throws_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000003', 'Invasão', null, null, null, null) $$,
  '42501', 'project not found or access denied', 'membro nao cria etapa em outro tenant'
);
select throws_ok(
  $$ select public.update_project_stage((select id from public.project_stages where name = 'Descoberta'), 'Descoberta', null, 'pending', '13000000-0000-4000-8000-000000000003', null, null) $$,
  'P0001', 'stage responsible must be an active member of the organization', 'responsavel suspenso e rejeitado'
);
select lives_ok(
  $$ select public.update_project_stage((select id from public.project_stages where name = 'Execução'), 'Execução técnica', 'Entrega', 'in_progress', '13000000-0000-4000-8000-000000000002', '2026-10-26', '2026-11-10') $$,
  'etapa pode ser editada e iniciada'
);
select is(
  (select responsible_user_id from public.project_stages where name = 'Execução técnica'),
  '13000000-0000-4000-8000-000000000002'::uuid, 'edicao preserva responsavel ativo'
);
select throws_ok(
  $$ select public.update_project_stage((select id from public.project_stages where name = 'Execução técnica'), 'Execução técnica', null, null, null, null, null) $$,
  'P0001', 'invalid stage status', 'status nulo de etapa e rejeitado explicitamente'
);
select throws_ok(
  $$ select public.update_project_stage((select id from public.project_stages where name = 'Execução técnica'), 'Execução técnica', null, 'invalid', null, null, null) $$,
  'P0001', 'invalid stage status', 'status invalido de etapa e rejeitado'
);
select throws_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000001',
    array[(select id from public.project_stages where name = 'Descoberta'), (select id from public.project_stages where name = 'Descoberta')]
  ) $$,
  'P0001', 'ordered stages must contain every active project stage exactly once', 'reordenacao de etapas rejeita ids duplicados'
);
select throws_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000001',
    array[(select id from public.project_stages where name = 'Descoberta'), 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid]
  ) $$,
  'P0001', 'ordered stages must contain every active project stage exactly once', 'reordenacao de etapas rejeita id inexistente'
);

reset role;
update public.project_stages
set position = case name when 'Descoberta' then 2147483646 else 2147483647 end
where project_id = '93000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000001',
    (select array_agg(id order by name desc) from public.project_stages where project_id = '93000000-0000-4000-8000-000000000001' and archived_at is null)
  ) $$,
  'reordenacao de etapas evita colisao e overflow perto do limite de integer'
);
select is(
  (select array_agg(position order by position) from public.project_stages where project_id = '93000000-0000-4000-8000-000000000001' and archived_at is null),
  array[1,2]::integer[], 'reordenacao mantem posicoes contiguas'
);
select throws_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000001',
    array[(select id from public.project_stages where name = 'Descoberta')]
  ) $$,
  'P0001', 'ordered stages must contain every active project stage exactly once', 'reordenacao incompleta e rejeitada'
);

select throws_ok(
  $$ select public.reorder_project_tasks((select id from public.project_stages where name = 'Execução técnica'), null) $$,
  'P0001', 'ordered task ids are required', 'array nulo de tarefas e rejeitado'
);
select throws_ok(
  $$ select public.reorder_project_tasks(null, '{}'::uuid[]) $$,
  'P0001', 'stage id is required', 'identificador obrigatorio de etapa nao aceita null'
);
select lives_ok(
  $$ select public.reorder_project_tasks((select id from public.project_stages where name = 'Execução técnica'), '{}'::uuid[]) $$,
  'array vazio reordena etapa sem tarefas'
);
reset role;
select lives_ok(
  $$ insert into public.project_tasks (
    id, organization_id, project_id, project_stage_id, title, position, created_by
  ) values (
    'a2000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    (select id from public.project_stages where name = 'Execução técnica'),
    'Prova do trigger de tarefa', 1,
    '13000000-0000-4000-8000-000000000002'
  ) $$,
  'guard aceita INSERT de tarefa sem resolver campo task_id de checklist'
);
select lives_ok(
  $$ update public.project_tasks
     set description = 'UPDATE validado'
     where id = 'a2000000-0000-4000-8000-000000000001' $$,
  'guard aceita UPDATE de tarefa sem resolver campos exclusivos de etapa'
);
delete from public.project_tasks where id = 'a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Prioridade nula', null, null, null, null) $$,
  'P0001', 'invalid task priority', 'prioridade nula na criacao e rejeitada explicitamente'
);
select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Prioridade invalida', null, 'critical', null, null) $$,
  'P0001', 'invalid task priority', 'prioridade invalida na criacao e rejeitada'
);
select lives_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Mapear requisitos', 'Entrevistas', 'high', '13000000-0000-4000-8000-000000000002', '2026-10-24') $$,
  'membro cria tarefa com prioridade responsavel e prazo'
);
select lives_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Validar escopo', null, 'medium', null, null) $$,
  'segunda tarefa recebe posicao automaticamente'
);
select lives_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Documentar', null, 'low', null, null) $$,
  'terceira tarefa e criada'
);
select is(
  (select array_agg(position order by position) from public.project_tasks where project_stage_id = (select id from public.project_stages where name = 'Descoberta')),
  array[1,2,3]::integer[], 'tarefas possuem ordem contigua'
);
select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Atribuição inválida', null, 'medium', '13000000-0000-4000-8000-000000000004', null) $$,
  'P0001', 'task assignee must be an active member of the organization', 'tarefa rejeita responsavel de outro tenant'
);
select lives_ok(
  $$ select public.update_project_task((select id from public.project_tasks where title = 'Mapear requisitos'), 'Mapear requisitos críticos', 'Entrevistas e síntese', 'urgent', '13000000-0000-4000-8000-000000000001', '2026-10-23') $$,
  'tarefa pode ser editada por RPC'
);
select is(
  (select priority from public.project_tasks where title = 'Mapear requisitos críticos'),
  'urgent', 'prioridade editada e persistida'
);
select is(
  (select count(*)::bigint from public.project_events where subject_id = (select id from public.project_tasks where title = 'Mapear requisitos críticos') and event_type in ('task_updated', 'task_assignee_changed', 'task_deadline_changed')),
  3::bigint, 'edicao, responsavel e prazo geram eventos especificos'
);
select throws_ok(
  $$ select public.update_project_task((select id from public.project_tasks where title = 'Mapear requisitos críticos'), 'Mapear requisitos críticos', null, null, null, null) $$,
  'P0001', 'invalid task priority', 'prioridade nula na edicao e rejeitada explicitamente'
);
select throws_ok(
  $$ select public.change_project_task_status((select id from public.project_tasks where title = 'Mapear requisitos críticos'), null) $$,
  'P0001', 'task status is required', 'status nulo de tarefa e rejeitado explicitamente'
);
select throws_ok(
  $$ select public.complete_project_task(null) $$,
  'P0001', 'task id is required', 'identificador obrigatorio de tarefa nao aceita null'
);
select throws_ok(
  $$ select public.change_project_task_status((select id from public.project_tasks where title = 'Mapear requisitos críticos'), 'invalid') $$,
  'P0001', 'invalid task status transition from todo to invalid', 'status invalido de tarefa e rejeitado'
);
select throws_ok(
  $$ select public.reorder_project_tasks(
    (select id from public.project_stages where name = 'Descoberta'),
    array[
      (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
      (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
      (select id from public.project_tasks where title = 'Documentar')
    ]
  ) $$,
  'P0001', 'ordered tasks must contain every stage task exactly once', 'reordenacao de tarefas rejeita ids duplicados'
);

reset role;
with ordered as (
  select id, row_number() over (order by position, id) as sequence
  from public.project_tasks
  where project_stage_id = (select id from public.project_stages where name = 'Descoberta')
)
update public.project_tasks task
set position = 2147483644 + ordered.sequence::integer
from ordered
where task.id = ordered.id;
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.reorder_project_tasks(
    (select id from public.project_stages where name = 'Descoberta'),
    (select array_agg(id order by title desc) from public.project_tasks where project_stage_id = (select id from public.project_stages where name = 'Descoberta'))
  ) $$,
  'tarefas sao reordenadas sem colisao ou overflow perto do limite de integer'
);
select is(
  (select array_agg(position order by position) from public.project_tasks where project_stage_id = (select id from public.project_stages where name = 'Descoberta')),
  array[1,2,3]::integer[], 'reordenacao de tarefas mantem posicoes contiguas'
);
select throws_ok(
  $$ select public.archive_project_stage((select id from public.project_stages where name = 'Descoberta')) $$,
  'P0001', 'stage cannot be archived while it has pending tasks', 'etapa com tarefas pendentes nao e arquivada'
);

select throws_ok(
  $$ select public.reorder_project_task_checklist((select id from public.project_tasks where title = 'Mapear requisitos críticos'), null) $$,
  'P0001', 'ordered checklist item ids are required', 'array nulo de checklist e rejeitado'
);
select lives_ok(
  $$ select public.reorder_project_task_checklist((select id from public.project_tasks where title = 'Mapear requisitos críticos'), '{}'::uuid[]) $$,
  'array vazio reordena tarefa sem checklist'
);
reset role;
select lives_ok(
  $$ insert into public.project_task_checklist_items (
    id, organization_id, project_id, task_id, title, position, created_by
  ) values (
    'a3000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000001',
    (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
    'Prova do trigger de checklist', 1,
    '13000000-0000-4000-8000-000000000002'
  ) $$,
  'guard aceita INSERT de checklist usando somente task_id desse registro'
);
select lives_ok(
  $$ update public.project_task_checklist_items
     set title = 'Prova atualizada do trigger de checklist'
     where id = 'a3000000-0000-4000-8000-000000000001' $$,
  'guard aceita UPDATE de checklist sem resolver project_stage_id no registro errado'
);
delete from public.project_task_checklist_items
where id = 'a3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ select public.create_project_task_checklist_item((select id from public.project_tasks where title = 'Mapear requisitos críticos'), null) $$,
  'P0001', 'checklist item title must contain between 1 and 500 characters', 'titulo obrigatorio do checklist nao aceita null'
);
select lives_ok(
  $$ select public.create_project_task_checklist_item((select id from public.project_tasks where title = 'Mapear requisitos críticos'), 'Entrevistar cliente') $$,
  'item de checklist e criado'
);
select lives_ok(
  $$ select public.create_project_task_checklist_item((select id from public.project_tasks where title = 'Mapear requisitos críticos'), 'Consolidar respostas') $$,
  'segundo item de checklist e criado'
);
select lives_ok(
  $$ select public.create_project_task_checklist_item((select id from public.project_tasks where title = 'Mapear requisitos críticos'), 'Item descartável') $$,
  'terceiro item de checklist e criado'
);
select lives_ok(
  $$ select public.update_project_task_checklist_item((select id from public.project_task_checklist_items where title = 'Consolidar respostas'), 'Consolidar e revisar respostas') $$,
  'titulo do checklist e editado'
);
select throws_ok(
  $$ select public.complete_project_task((select id from public.project_tasks where title = 'Mapear requisitos críticos')) $$,
  'P0001', 'task cannot be completed while it has pending checklist items', 'checklist pendente bloqueia conclusao da tarefa'
);
select lives_ok(
  $$ select public.archive_project_task_checklist_item((select id from public.project_task_checklist_items where title = 'Item descartável')) $$,
  'item de checklist pode ser arquivado'
);
select is(
  (select count(*)::integer from public.project_task_checklist_items where task_id = (select id from public.project_tasks where title = 'Mapear requisitos críticos') and archived_at is null),
  2, 'arquivamento preserva item mas o remove da lista ativa'
);
select throws_ok(
  $$ select public.reorder_project_task_checklist(
    (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
    array[
      (select id from public.project_task_checklist_items where title = 'Entrevistar cliente'),
      (select id from public.project_task_checklist_items where title = 'Entrevistar cliente')
    ]
  ) $$,
  'P0001', 'ordered checklist items must contain every active task item exactly once', 'reordenacao de checklist rejeita ids duplicados'
);
select throws_ok(
  $$ select public.reorder_project_task_checklist(
    (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
    array[
      (select id from public.project_task_checklist_items where title = 'Entrevistar cliente'),
      (select id from public.project_task_checklist_items where title = 'Item descartável')
    ]
  ) $$,
  'P0001', 'ordered checklist items must contain every active task item exactly once', 'reordenacao de checklist rejeita id arquivado'
);
select throws_ok(
  $$ select public.reorder_project_task_checklist(
    (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
    array[
      (select id from public.project_task_checklist_items where title = 'Entrevistar cliente'),
      'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid
    ]
  ) $$,
  'P0001', 'ordered checklist items must contain every active task item exactly once', 'reordenacao de checklist rejeita id inexistente'
);

reset role;
with ordered as (
  select id, row_number() over (order by position, id) as sequence
  from public.project_task_checklist_items
  where task_id = (select id from public.project_tasks where title = 'Mapear requisitos críticos')
    and archived_at is null
)
update public.project_task_checklist_items item
set position = 2147483645 + ordered.sequence::integer
from ordered
where item.id = ordered.id;
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select public.reorder_project_task_checklist(
    (select id from public.project_tasks where title = 'Mapear requisitos críticos'),
    (select array_agg(id order by title desc) from public.project_task_checklist_items where task_id = (select id from public.project_tasks where title = 'Mapear requisitos críticos') and archived_at is null)
  ) $$,
  'checklist e reordenado sem colisao ou overflow perto do limite de integer'
);
select throws_ok(
  $$ select public.set_project_task_checklist_item_completed(null, true) $$,
  'P0001', 'checklist item id is required', 'identificador obrigatorio de checklist nao aceita null'
);
select throws_ok(
  $$ select public.set_project_task_checklist_item_completed((select id from public.project_task_checklist_items where title = 'Entrevistar cliente'), null) $$,
  'P0001', 'checklist completion state is required', 'estado obrigatorio do checklist nao aceita null'
);
select lives_ok(
  $$ select public.set_project_task_checklist_item_completed((select id from public.project_task_checklist_items where title = 'Entrevistar cliente'), true) $$,
  'primeiro item e concluido'
);
select lives_ok(
  $$ select public.set_project_task_checklist_item_completed((select id from public.project_task_checklist_items where title = 'Consolidar e revisar respostas'), true) $$,
  'segundo item e concluido'
);
select ok(
  (select bool_and(completed_at is not null and completed_by = '13000000-0000-4000-8000-000000000002'::uuid) from public.project_task_checklist_items where archived_at is null),
  'conclusao do checklist usa timestamp e ator do servidor'
);
select lives_ok(
  $$ select public.complete_project_task((select id from public.project_tasks where title = 'Mapear requisitos críticos')) $$,
  'tarefa e concluida apos checklist'
);
select ok((select completed_at is not null from public.project_tasks where title = 'Mapear requisitos críticos'), 'tarefa concluida recebe timestamp');
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000001'),
  33, 'uma de tres tarefas gera progresso arredondado de 33 por cento'
);
select lives_ok(
  $$ select public.change_project_task_status((select id from public.project_tasks where title = 'Validar escopo'), 'cancelled') $$,
  'tarefa pode ser cancelada por transicao valida'
);
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000001'),
  50, 'tarefa cancelada sai do denominador'
);
select lives_ok(
  $$ select public.complete_project_task((select id from public.project_tasks where title = 'Documentar')) $$,
  'tarefa sem checklist pode ser concluida'
);
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000001'),
  100, 'todas as tarefas elegiveis concluidas geram cem por cento'
);
select lives_ok(
  $$ select public.reopen_project_task((select id from public.project_tasks where title = 'Mapear requisitos críticos')) $$,
  'tarefa concluida pode ser reaberta'
);
select ok((select completed_at is null from public.project_tasks where title = 'Mapear requisitos críticos'), 'reabertura limpa timestamp de conclusao');
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000001'),
  50, 'reabertura recalcula progresso'
);
select lives_ok(
  $$ select public.complete_project_task((select id from public.project_tasks where title = 'Mapear requisitos críticos')) $$,
  'tarefa reaberta pode ser concluida novamente'
);
select lives_ok(
  $$ select public.archive_project_stage((select id from public.project_stages where name = 'Descoberta')) $$,
  'etapa e arquivada quando todas as tarefas estao concluidas ou canceladas'
);
select is(
  (select count(*)::integer from public.project_tasks where project_stage_id = (select id from public.project_stages where name = 'Descoberta')),
  3, 'arquivamento preserva tarefas'
);
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000001'),
  100, 'tarefas de etapa arquivada continuam no progresso'
);
select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Descoberta'), 'Tardia', null, 'medium', null, null) $$,
  'P0001', 'archived stages are immutable', 'etapa arquivada nao recebe tarefa'
);
select throws_ok(
  $$ select public.update_project_stage((select id from public.project_stages where name = 'Descoberta'), 'Alterada', null, 'pending', null, null, null) $$,
  'P0001', 'archived stages are immutable', 'etapa arquivada nao pode ser editada'
);
select throws_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000001',
    array[(select id from public.project_stages where name = 'Descoberta')]
  ) $$,
  'P0001', 'ordered stages must contain every active project stage exactly once', 'reordenacao de etapas rejeita id arquivado'
);

select lives_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Execução técnica'), 'Publicar entrega', null, 'high', null, '2026-11-10') $$,
  'tarefa pendente e criada na etapa ativa'
);
select throws_ok(
  $$ select public.reorder_project_tasks(
    (select id from public.project_stages where name = 'Execução técnica'),
    array[(select id from public.project_tasks where title = 'Documentar')]
  ) $$,
  'P0001', 'ordered tasks must contain every stage task exactly once', 'reordenacao de tarefas rejeita id de outra etapa'
);
select throws_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000001', null, null) $$,
  'P0001', 'project status is required', 'status nulo de projeto e rejeitado explicitamente'
);
select lives_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000001', 'in_progress', null) $$,
  'projeto entra em andamento'
);
select throws_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000001', 'completed', null) $$,
  'P0001', 'project cannot be completed with pending tasks', 'projeto com tarefa elegivel pendente nao conclui'
);
select lives_ok(
  $$ select public.complete_project_task((select id from public.project_tasks where title = 'Publicar entrega')) $$,
  'ultima tarefa e concluida'
);
select lives_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000001', 'completed', null) $$,
  'projeto conclui quando nao ha tarefas pendentes'
);
select throws_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000001', 'Póstuma', null, null, null, null) $$,
  'P0001', 'terminal projects are immutable', 'projeto concluido bloqueia nova etapa'
);
select throws_ok(
  $$ select public.reopen_project_task((select id from public.project_tasks where title = 'Publicar entrega')) $$,
  'P0001', 'terminal projects are immutable', 'projeto concluido bloqueia reabertura de tarefa'
);
reset role;
select throws_ok(
  $$ update public.project_stages set name = 'Bypass privilegiado' where name = 'Execução técnica' $$,
  'P0001', 'terminal projects are immutable', 'trigger bloqueia mutacao privilegiada de filho apos conclusao'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select progress_percent from public.project_progress where project_id = '93000000-0000-4000-8000-000000000002'),
  0, 'projeto sem tarefas apresenta zero por cento'
);
select lives_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000002', 'in_progress', null) $$,
  'projeto vazio entra em andamento'
);
select lives_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000002', 'completed', null) $$,
  'projeto vazio pode ser concluido por compatibilidade'
);

select ok(
  (select bool_and(subject_type is not null and subject_id is not null and actor_name_snapshot <> '') from public.project_events),
  'todos os eventos identificam entidade e ator'
);
select ok(
  (select count(*) > 0 from public.project_events where event_type = 'task_reopened' and subject_type = 'task'),
  'reabertura possui evento tipado'
);
select ok(
  (select count(*) > 0 from public.project_events where event_type = 'checklist_item_archived' and subject_type = 'checklist_item'),
  'arquivamento de checklist possui evento tipado'
);
select throws_ok(
  $$ update public.project_tasks set title = 'Bypass' where title = 'Publicar entrega' $$,
  '42501', null, 'DML direto de tarefa permanece bloqueado'
);

reset role;

-- Integridade composta e pos-condicao para dados legados, executadas como owner da migration.
select throws_ok(
  $$ insert into public.project_tasks (
    organization_id, project_id, project_stage_id, title, position, created_by
  ) values (
    '23000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', null,
    'Raiz proibida', 99, '13000000-0000-4000-8000-000000000004'
  ) $$,
  '23502', null, 'nova tarefa sem etapa e rejeitada apos backfill'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000003', 'Etapa B', null, null, null, null) $$,
  'owner B cria etapa no proprio tenant'
);
reset role;
select throws_ok(
  $$ select public.reorder_project_stages(
    '93000000-0000-4000-8000-000000000003',
    array[(select id from public.project_stages where name = 'Descoberta')]
  ) $$,
  'P0001', 'ordered stages must contain every active project stage exactly once', 'reordenacao rejeita id pertencente a outra organizacao'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::integer from public.project_stages), 1, 'RLS mostra somente etapa do tenant B');
select is((select count(*)::integer from public.project_tasks), 0, 'RLS nao mostra tarefas do tenant A');
select is((select count(*)::integer from public.project_events where project_id = '93000000-0000-4000-8000-000000000001'), 0, 'RLS nao mostra historico do tenant A');
select is((select count(*)::integer from public.project_progress), 1, 'view de progresso respeita RLS');
select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Etapa B'), 'Tarefa B', null, 'medium', '13000000-0000-4000-8000-000000000002', null) $$,
  'P0001', 'task assignee must be an active member of the organization', 'tenant B nao atribui membro do tenant A'
);
select lives_ok(
  $$ select public.change_project_status('93000000-0000-4000-8000-000000000003', 'cancelled', null) $$,
  'projeto pode ser cancelado por transicao valida'
);
select throws_ok(
  $$ select public.create_project_task((select id from public.project_stages where name = 'Etapa B'), 'Tarefa tardia', null, 'medium', null, null) $$,
  'P0001', 'terminal projects are immutable', 'projeto cancelado bloqueia mutacao de tarefa'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::integer from public.project_stages), 0, 'usuario externo nao le etapas');
select is((select count(*)::integer from public.project_tasks), 0, 'usuario externo nao le tarefas');
select is((select count(*)::integer from public.project_task_checklist_items), 0, 'usuario externo nao le checklist');
select is((select count(*)::integer from public.project_progress), 0, 'usuario externo nao le progresso');
select throws_ok(
  $$ select public.create_project_stage('93000000-0000-4000-8000-000000000003', 'Invasão externa', null, null, null, null) $$,
  '42501', 'project not found or access denied', 'usuario externo nao opera projeto'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.project_stages $$, '42501', null, 'anon nao le etapas');
select throws_ok($$ select public.complete_project_task('93000000-0000-4000-8000-000000000001') $$, '42501', null, 'anon nao executa RPC');

reset role;
set constraints all immediate;
select * from finish();
rollback;
