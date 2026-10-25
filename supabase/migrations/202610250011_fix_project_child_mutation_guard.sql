begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regprocedure('private.guard_project_child_mutation()') is null
     or to_regclass('public.project_task_checklist_items') is null then
    raise exception 'migration 010 must be applied before migration 011';
  end if;
end;
$$;

-- Corrige o trigger polimorfico da migration 010. Referencias a campos que
-- existem somente em uma das tabelas precisam ficar em blocos exclusivos para
-- que o PL/pgSQL nao tente resolve-las contra o tipo de registro errado.
create or replace function private.guard_project_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  child_organization_id uuid;
  child_project_id uuid;
  parent_status text;
begin
  if tg_table_name = 'project_stages' then
    child_organization_id := new.organization_id;
    child_project_id := new.project_id;
  elsif tg_table_name = 'project_tasks' then
    child_organization_id := new.organization_id;
    child_project_id := new.project_id;
  elsif tg_table_name = 'project_task_checklist_items' then
    child_organization_id := new.organization_id;
    child_project_id := new.project_id;
  else
    raise exception 'unsupported project child table: %', tg_table_name;
  end if;

  select project.status into parent_status
  from public.projects project
  where project.id = child_project_id
    and project.organization_id = child_organization_id
  for update;

  if not found then
    raise exception 'parent project not found';
  end if;

  if parent_status in ('completed', 'cancelled') then
    raise exception 'terminal projects are immutable';
  end if;

  if tg_table_name = 'project_stages' then
    if tg_op = 'UPDATE' then
      if old.archived_at is not null
         and (to_jsonb(new) - 'updated_at') is distinct from
             (to_jsonb(old) - 'updated_at') then
        raise exception 'archived stages are immutable';
      end if;
    end if;
  elsif tg_table_name = 'project_tasks' then
    if exists (
      select 1
      from public.project_stages stage
      where stage.organization_id = new.organization_id
        and stage.project_id = new.project_id
        and stage.id = new.project_stage_id
        and stage.archived_at is not null
    ) then
      raise exception 'archived stages are immutable';
    end if;
  elsif tg_table_name = 'project_task_checklist_items' then
    if exists (
      select 1
      from public.project_tasks task
      join public.project_stages stage
        on stage.organization_id = task.organization_id
       and stage.project_id = task.project_id
       and stage.id = task.project_stage_id
      where task.organization_id = new.organization_id
        and task.project_id = new.project_id
        and task.id = new.task_id
        and stage.archived_at is not null
    ) then
      raise exception 'archived stages are immutable';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_project_child_mutation()
  from public, anon, authenticated;

comment on function private.guard_project_child_mutation() is
  'Bloqueia o projeto pai e protege mutacoes de etapas, tarefas e checklist sem acessar campos de outra tabela.';

commit;
