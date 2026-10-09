# Banco multiempresa do RODE Gestão

Esta pasta contém somente a primeira camada persistente do produto. Ela não cria CRUD, cobrança, cadastro público nem autorização baseada em dados editáveis pelo usuário.

## Arquivos

- `migrations/202610080001_initial_multi_tenant_schema.sql`: schema, integridade, índices, triggers, privilégios e RLS.
- `migrations/202610080003_services_and_proposals.sql`: catálogo, propostas, itens, metadados de documentos, eventos e aprovação idempotente.
- `migrations/202610080004_proposal_storage.sql`: bucket privado e políticas de objetos para PDFs de propostas.
- `migrations/202610080005_project_templates_and_projects.sql`: templates, projetos, etapas e tarefas.
- `bootstrap/202610080002_bootstrap_rode.sql.template`: modelo deliberadamente não executável para criar a organização RODE e indicar um owner Auth já existente.
- `tests/database/rls_multi_tenant.test.sql`: testes pgTAP transacionais de isolamento e permissões.
- `tests/database/proposals_projects_rls.test.sql`: testes pgTAP da etapa 4A.
- `docs/stage-4a-proposals-projects.md`: modelo, Storage, segurança, aplicação e evolução para 4B/4C.

## Modelo e relacionamentos

- `organizations`: tenant e estado operacional.
- `profiles`: extensão básica de `auth.users`; o próprio usuário altera apenas seu perfil.
- `organization_members`: associação usuário–organização, com `owner`, `admin` ou `member` e estado `invited`, `active` ou `suspended`.
- `clients`: cliente/lead pertencente a uma organização.
- `pipeline_stages`: etapas comerciais configuráveis por organização.
- `opportunities`: negociação ligada a cliente e etapa da mesma organização.
- `client_activities`: histórico ligado a cliente e, opcionalmente, a uma oportunidade desse mesmo cliente e organização.

As referências multiempresa usam FKs compostas que incluem `organization_id`. Assim, a integridade não depende apenas de RLS: uma oportunidade não aceita cliente ou etapa de outro tenant, e uma atividade não aceita uma oportunidade de outro cliente/tenant.

## Matriz de acesso

| Recurso | Leitura | Criação/alteração | Exclusão |
| --- | --- | --- | --- |
| Organização | membro ativo de organização ativa | owner/admin, exceto `status` | não exposta à Data API |
| Perfil | próprio usuário ou membro ativo em comum | próprio usuário | não exposta |
| Membros | membro ativo | owner/admin; admin não gerencia owner | não exposta; suspender preserva auditoria |
| Clientes e oportunidades | membro ativo | membro ativo | owner/admin |
| Etapas do pipeline | membro ativo | owner/admin | owner/admin |
| Atividades | membro ativo | autor; admin também pode alterar | owner/admin |

Não existem grants para `anon`. A role `authenticated` recebe somente os comandos que têm políticas correspondentes. Não há política de `INSERT` em `organizations`, nem caminho público para criar tenants ou o primeiro owner.

## Decisões de segurança

- A autorização deriva de `auth.uid()` e do vínculo ativo armazenado no banco; `organization_id` e papel enviados pelo navegador não concedem acesso.
- Organizações `suspended` ou `inactive` deixam de autorizar acesso. O campo `status` não tem grant de atualização pela Data API e fica reservado à operação confiável da plataforma.
- Funções `SECURITY DEFINER` existem apenas para consultar associação sem recursão de RLS e para validar o último owner. Elas ficam no schema `private`, têm `search_path` vazio, nomes totalmente qualificados e execução revogada de `public`/`anon`.
- `organization_id`, identidade do vínculo e campos de autoria são imutáveis por triggers.
- Uma constraint trigger diferida exige ao menos um owner ativo ao final da transação. Isso permite criar organização e owner juntos, mas impede suspender/rebaixar o último owner.
- Não há papel global de administrador nem promoção automática no login. Uma futura administração da plataforma deve usar uma tabela de privilégios separada e não editável pelo próprio usuário.
- `service_role` continua restrita a backend confiável e rotinas operacionais. Ela contorna RLS e não deve ser usada pelo navegador.

## Bootstrap seguro da RODE

1. Crie ou convide o usuário inicial pelo painel Supabase em **Authentication > Users** e confirme que ele pode autenticar.
2. Copie somente o UUID desse usuário. UUID não é credencial, mas deve ser revisado cuidadosamente.
3. Abra `bootstrap/202610080002_bootstrap_rode.sql.template`, substitua o UUID sentinela e revise nome, razão social e slug.
4. Salve a cópia como uma nova migration, por exemplo `supabase/migrations/202610080002_bootstrap_rode.sql`.
5. Revise o diff antes de aplicar. Nunca inclua e-mail, senha, JWT, chave `service_role` ou secret key.

O bootstrap falha se o UUID continuar sentinela ou não existir em `auth.users`. Ele é idempotente para organização, vínculo, perfil e etapas. As etapas iniciais são criadas/atualizadas exclusivamente para a organização localizada pelo slug `rode`.

## Aplicação pelo Supabase CLI

Pré-requisitos: Supabase CLI instalado, Docker ativo para validação local e projeto inicializado/linkado conforme o ambiente.

```powershell
supabase init
supabase start
supabase db reset
supabase db lint --local --level error --fail-on error
supabase test db supabase/tests/database/rls_multi_tenant.test.sql
```

Execute `supabase init` apenas enquanto `supabase/config.toml` ainda não existir. Faça o reset e os testes antes de transformar o template de bootstrap em migration, pois o usuário Auth de produção não existe automaticamente no banco local.

`db reset` recria apenas o banco local. Depois de validar localmente e gerar a migration de bootstrap com o UUID correto:

```powershell
supabase link --project-ref <PROJECT_REF>
supabase db push --dry-run
supabase db push
```

O `db push` remoto deve ser executado manualmente somente após conferir que o projeto vinculado é o ambiente desejado e que existe backup adequado.

## Aplicação pelo SQL Editor

1. Abra o SQL Editor do projeto correto e confirme o ambiente.
2. Cole e execute integralmente `migrations/202610080001_initial_multi_tenant_schema.sql`.
3. Crie/confirme o usuário inicial em Authentication.
4. Substitua o UUID no template de bootstrap e execute a cópia revisada.
5. Registre os dois scripts aplicados no histórico operacional. O SQL Editor não preenche automaticamente o histórico de migrations do CLI; prefira o CLI para evolução contínua.

## Evolução prevista

- Convites devem ser feitos por uma operação server-side autenticada, com verificação explícita de `owner`/`admin`; o navegador não decide papel nem tenant. Apenas um owner pode criar ou promover outro owner.
- Novos módulos devem repetir `organization_id`, FKs compostas e políticas separadas por operação.
- Se houver colaboradores em várias organizações, o tenant ativo deve ser apenas contexto de interface; a autorização continuará sendo validada pelo banco.
- Auditoria detalhada, soft delete, retenção, autorização de plataforma e processos de saída do último owner ficam para migrations futuras, sem afrouxar as políticas atuais.
