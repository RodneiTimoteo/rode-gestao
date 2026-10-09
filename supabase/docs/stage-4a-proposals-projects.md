# Etapa 4A — propostas, documentos e projetos

Esta etapa adiciona somente banco, RLS, configuração declarativa do Storage e testes. Ela não cria telas, CRUD, Server Actions, faturamento, agenda ou conversão automática de proposta em projeto.

## Ordem das migrations

A migration inicial `202610080001_initial_multi_tenant_schema.sql` permanece intacta e deve estar aplicada. Execute as novas migrations exatamente nesta ordem:

1. `202610080003_services_and_proposals.sql`
2. `202610080004_proposal_storage.sql`
3. `202610080005_project_templates_and_projects.sql`

O número `002` continua reservado ao bootstrap específico da organização RODE. Não renumere uma migration que já tenha sido aplicada em algum ambiente.

## Modelo relacional

### Serviços e propostas

- `services` pertence a uma organização e funciona como catálogo opcional. O preço é apenas referência; o item preserva o valor negociado.
- `proposals` pertence a uma organização e a um cliente. A oportunidade é opcional, mas a FK composta exige a mesma organização e o mesmo cliente.
- `proposal_items` pertence a uma proposta e pode apontar para um serviço do mesmo tenant. Nome, descrição e preços são snapshots independentes do catálogo.
- `proposal_attachments` registra metadados e versões de PDFs privados. O objeto físico fica no bucket `proposal-documents`.
- `proposal_events` é um histórico append-only alimentado por triggers para criação, revisão, mudança de status e anexos.

O código comercial usa um contador privado por `(organization_id, document_type)`. O `UPSERT` no contador serializa alocações concorrentes; lacunas após transações revertidas não são um problema de integridade e o código não deve ser tratado como contador fiscal.

Os totais são derivados dos itens por trigger. `line_total` é uma coluna gerada, e os campos totais da proposta não têm grant de atualização para `authenticated`.

Revisões formam uma cadeia por `revision_group_id`, `revision_number` e `supersedes_proposal_id`. Propostas em estado terminal (`approved`, `rejected`, `expired`, `cancelled`) ficam imutáveis; uma negociação posterior deve gerar revisão. `public.approve_proposal(uuid)` bloqueia a linha, aceita somente `sent`/`negotiating` e retorna sem efeitos adicionais quando a proposta já está aprovada.

### Projetos

- `project_templates` possui etapas e tarefas próprias por organização.
- `projects` pertence a um cliente, pode referenciar uma proposta aprovada ou ser criado manualmente e pode registrar o template de origem.
- `project_stages` e `project_tasks` são snapshots independentes. As referências ao template servem como proveniência; alterações posteriores no modelo não propagam para o projeto.
- A unicidade parcial em `(organization_id, proposal_id)` impede duas conversões da mesma proposta, inclusive quando requisições concorrentes disputam a inserção.
- O progresso pode ser calculado como `tarefas done / tarefas não cancelled`. Ele não é persistido nesta etapa para evitar estado derivado inconsistente.

Status iniciais:

| Recurso | Estados |
| --- | --- |
| Proposta | `draft`, `sent`, `negotiating`, `approved`, `rejected`, `expired`, `cancelled` |
| Projeto | `planning`, `active`, `on_hold`, `completed`, `cancelled` |
| Etapa de projeto | `pending`, `in_progress`, `completed`, `skipped` |
| Tarefa | `todo`, `in_progress`, `blocked`, `done`, `cancelled` |

A futura etapa 4C deve copiar template, etapas e tarefas e criar o projeto em uma única transação server-side. A migration não gera projeto automaticamente ao aprovar uma proposta.

## Segurança e RLS

Todas as tabelas públicas novas têm RLS habilitada, grants explícitos e políticas por operação. `anon` não recebe privilégios nas tabelas de negócio. A autorização continua derivando de `auth.uid()`, do vínculo ativo e do estado ativo da organização por meio das funções existentes `private.is_active_org_member` e `private.has_org_role`.

| Recurso | Leitura | Escrita | Exclusão |
| --- | --- | --- | --- |
| Serviços | membro ativo | owner/admin | owner/admin |
| Propostas | membro ativo | membro ativo; colunas protegidas não têm grant | não exposta |
| Itens | membro ativo | membro ativo enquanto a proposta está em `draft` | membro ativo enquanto `draft` |
| Metadados de anexo | membro ativo | upload pelo próprio usuário; atualização limitada | não exposta |
| Eventos | membro ativo | somente triggers | não exposta |
| Templates, etapas e tarefas de template | membro ativo | owner/admin | owner/admin |
| Projetos, etapas e tarefas | membro ativo | membro ativo | owner/admin |

FKs compostas com `organization_id` impedem referências cruzadas mesmo fora da Data API. Triggers tornam tenant, autoria e identidades estruturais imutáveis. Responsáveis precisam continuar membros ativos; suspender ou remover o vínculo corta a leitura pela RLS, mas preserva a FK e a auditoria histórica.

As funções `SECURITY DEFINER` novas são limitadas a numeração, sincronização de totais/eventos e versionamento de anexos. Todas usam `search_path` vazio, referências qualificadas e `EXECUTE` revogado das roles da API. A função pública de aprovação é `SECURITY INVOKER`.

## Storage privado

A migration cria ou normaliza o bucket privado `proposal-documents` com limite de 20 MiB e MIME `application/pdf`. O caminho obrigatório é:

```text
<organization_id>/<proposal_id>/<attachment_id>/<nome-seguro>.pdf
```

As políticas em `storage.objects` exigem correspondência exata com `proposal_attachments`:

- download e listagem: membro ativo do tenant do metadado;
- upload: membro ativo, metadado previamente criado e `uploaded_by = auth.uid()`;
- exclusão física: owner/admin;
- update/upsert de objeto: sem política, para impedir sobrescrita e preservar versões.

A aplicação futura deve usar a API do Supabase Storage, nunca inserir ou atualizar `storage.objects` diretamente. Para links temporários, use signed URLs curtas; a autorização deve ser validada antes da emissão.

Fluxo futuro recomendado:

1. validar usuário, tenant, proposta, MIME real, extensão, tamanho e checksum no servidor;
2. gerar previamente `attachment_id` e caminho canônico;
3. inserir o metadado;
4. enviar o arquivo com `upsert: false`;
5. em falha, executar compensação confiável para marcar o metadado como removido e, em substituições, restaurar a versão anterior como atual;
6. para exclusão, remover o objeto primeiro e somente depois marcar `storage_deleted_at`.

O banco e o bucket limitam PDF e tamanho, mas isso não substitui inspeção de conteúdo no servidor. O nome original nunca deve compor o caminho sem sanitização.

Antes de aplicar em um projeto existente, audite políticas adicionais do Storage. Políticas permissivas são combinadas por `OR`; uma política antiga ampla pode enfraquecer estas regras:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

Não remova políticas desconhecidas automaticamente. Revise a finalidade de cada uma e remova manualmente apenas as que forem comprovadamente obsoletas.

## Validação local

Pré-requisitos: Supabase CLI e Docker disponíveis. Em um clone/local descartável, com todas as migrations necessárias presentes:

```powershell
supabase start
supabase db reset
supabase db lint --local --level error --fail-on error
supabase test db supabase/tests/database/rls_multi_tenant.test.sql
supabase test db supabase/tests/database/proposals_projects_rls.test.sql
```

O segundo teste cria fixtures dentro de uma transação e termina com `rollback`. A inserção direta em `storage.objects` existe somente para montar a fixture pgTAP; código de aplicação deve usar a API do Storage.

### Concorrência reproduzível

Use duas sessões SQL no banco de teste, nunca no principal.

Numeração de proposta:

1. em A, abra `begin` e insira uma proposta para a mesma organização;
2. sem confirmar A, em B abra `begin` e insira outra proposta para a mesma organização;
3. B deve aguardar o lock do contador;
4. confirme A e depois B;
5. os códigos devem ser distintos e sequenciais para o tenant.

Conversão em projeto:

1. use uma proposta aprovada ainda sem projeto;
2. em A e B, tente inserir um projeto para a mesma `(organization_id, proposal_id)`;
3. uma sessão conclui; a outra deve falhar com `23505` após a resolução do lock.

Aprovação:

1. deixe a proposta em `sent`;
2. chame `approve_proposal` simultaneamente em A e B;
3. ambas retornam o mesmo UUID e deve existir somente um evento de transição para `approved`.

## Aplicação em ambientes Supabase

### CLI — testes primeiro

Confirme o projeto vinculado antes de qualquer comando remoto:

```powershell
supabase status
supabase link --project-ref <REF_DO_PROJETO_DE_TESTES>
supabase db push --dry-run
supabase db push
```

Depois de validar testes funcionais e RLS no projeto de testes, repita o processo para o principal em uma janela controlada, com backup/PITR verificado e a referência do projeto conferida explicitamente:

```powershell
supabase link --project-ref <REF_DO_PROJETO_PRINCIPAL>
supabase db push --dry-run
supabase db push
```

`db push` deve ser executado pelo responsável somente após revisão. Esta entrega não executa nenhum desses comandos remotos.

### SQL Editor

Se o CLI não puder ser usado:

1. abra o projeto de testes e confirme o nome/ref no painel;
2. execute integralmente os arquivos `003`, `004` e `005`, um por vez e nessa ordem;
3. registre manualmente os scripts aplicados, pois o SQL Editor não substitui o histórico de migrations do CLI;
4. execute o arquivo pgTAP somente se a extensão estiver disponível e apenas em ambiente de testes;
5. valide login de member/admin/owner, isolamento entre tenants, upload/download e conversão;
6. somente após aprovação, repita os três scripts no principal.

## Pendências para 4B e 4C

- Implementar validação real de PDF, tamanho, checksum e nome seguro no servidor.
- Definir retenção, limpeza de metadados órfãos e compensação de upload/substituição.
- Implementar emissão de signed URLs e trilha de auditoria para download/exclusão, se exigida.
- Copiar templates para projetos em transação confiável, tratando `23505` como conversão já realizada.
- Definir se membros comuns podem aprovar propostas ou se a operação ficará restrita a owner/admin por regra comercial. O schema atual permite escrita a todo membro ativo, coerente com o CRM existente.
- Definir regras de edição de projetos encerrados, SLA, campos extras e notificações antes de expandir o modelo.
- Avaliar política de arquivamento/soft delete de serviços, templates e projetos antes de expor exclusão na interface.

## Referências oficiais

- [Supabase Storage — Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Storage — Schema Design](https://supabase.com/docs/guides/storage/schema/design)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
