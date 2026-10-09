# Etapa 4B — interface e permissão de aprovação

## Migration 006

`202610080006_proposal_approval_permissions.sql` deve ser aplicada depois das migrations 003, 004 e 005. Ela:

- restringe a transição para `approved`, pela RPC e por `UPDATE` direto, a owner/admin ativos da mesma organização;
- verifica a autorização antes do retorno idempotente da RPC;
- preserva assinatura, locks, transições, eventos automáticos e campos de aprovação;
- adiciona RPCs `SECURITY INVOKER` para salvar rascunho + itens e criar revisão de forma transacional, sempre sob RLS;
- não cria projeto e não altera proposta terminal.

## Migration 007

`202610080007_proposal_attachment_replacement_permissions.sql` corrige uma autorização que precisa existir no banco, e não apenas na rota HTTP: um `member` só pode versionar o próprio documento, enquanto `owner` e `admin` podem substituir documentos da organização. A migration não foi aplicada remotamente nesta auditoria.

## Validação local

Com Docker e Supabase CLI disponíveis, em um banco local descartável:

```powershell
supabase start
supabase db reset
supabase db lint --local --level error --fail-on error
supabase test db supabase/tests/database/rls_multi_tenant.test.sql
supabase test db supabase/tests/database/proposals_projects_rls.test.sql
supabase test db supabase/tests/database/proposal_draft_revision_functions.test.sql
supabase test db supabase/tests/database/proposal_attachment_replacement_permissions.test.sql
```

O teste geral de propostas contém 49 asserções pgTAP. O teste específico das RPCs transacionais contém 44 asserções para criação e edição de itens, rollback integral, cliente imutável, duplicidade de revisão, cópia de snapshots e isolamento entre organizações, sempre identificando original e revisão por UUID. O teste de substituição de anexos contém 9 asserções. Todos terminam em `rollback`.

## Aplicação no ambiente de testes

Esta entrega não executa comandos remotos. Após revisão e backup:

1. confirme no painel e no terminal que a referência é a do projeto de testes;
2. execute `supabase link --project-ref <REF_TESTES>` somente se necessário;
3. revise `supabase db push --dry-run` e confirme exatamente quais migrations serão aplicadas (neste estado, a única pendente deve ser a 007 se a 006 já estiver no projeto de testes);
4. execute `supabase db push`;
5. repita os testes funcionais abaixo antes de considerar o ambiente principal.

Não aplique a migration no principal sem aprovação explícita e uma nova conferência do projeto vinculado.

## Teste funcional por papel

- **member:** criar rascunho, editar itens, enviar, iniciar negociação, rejeitar/cancelar quando permitido, anexar/abrir PDF; confirmar ausência da ação de aprovar e recusa do banco se a RPC for chamada diretamente.
- **admin:** repetir o fluxo e aprovar proposta `sent` ou `negotiating`; repetir a aprovação e confirmar que não surge um segundo evento.
- **owner:** repetir a aprovação e criar revisão de uma proposta terminal.
- Em cada papel, tente abrir IDs e PDFs de outra organização e confirme resposta de não encontrado/sem permissão.

Para PDFs, valide também arquivo renomeado que não começa com `%PDF-`, MIME incorreto, arquivo maior que 20 MB, falha de rede com nova tentativa e substituição preservando versões anteriores.
