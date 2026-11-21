# Checkpoint da implementação

## Referência inicial

- Data da preparação do pacote em 20/11/2026.
- Base observada b2dfd32.
- Branch observada main, sincronizada no último trabalho.
- Interface proposta disponível em ui/dist/index.html.
- Nenhuma fase de lógica deste pacote iniciada pelo Codex.
- SDD de implementação a ser criado pelo Claude na P0.

## Estado atual

**P0 e P1 concluídas e commitadas.** Próxima fase: **P2 (Operações de integração e saúde)**, começando por **P2-001** (domínio `IntegrationOperation` em `src/core/integrations/operations.ts`).

### Registro por subtarefa

| Campo | Valor |
| --- | --- |
| Commit e branch atuais | `d7c4d82` (HEAD) · branch `main` |
| Alterações locais | tasks.md P0/P1 marcados `[x]`; este CHECKPOINT. `.specs/` é gitignored |
| Última tarefa concluída | **P1 inteira** — `367ee77` (agents.ts P1-001/002/003), `107ca75` (skills-query.ts P1-004 núcleo), `e59fbf7` (bridge+IPC skills.list/detail, agent.update/delete), `d7c4d82` (renderer Skills+Agentes+ajuda, inclui fix do `skills.detail` p/ body no detalhe) |
| Tarefa em andamento | nenhuma — iniciar P2-001 |
| Decisões | Ver `sdd/design.md` §8 |
| Verificação | `npm run typecheck` + `npm run build` + `npm test` = **901 testes verdes** (119 arquivos) |
| Próxima ação exata | P2-001: criar `src/core/integrations/operations.ts` (journal por-id, eventos `OP_STEP`, snapshot via `Journal.project`, evidência por efeito). Depois P2-002 (consolidar customize no core R2 + lock por revisão), P2-003 (HealthStatus + integration.test estendido + evento `integration.progress`), P2-004 (operation.get + recuperação), P2-005 (renderer) |
| Bloqueios | **Validação visual/pixel de P1 pendente** (precisa de sessão gráfica interativa — `npm run desktop:dev`); lógica de bridge já coberta por teste. P5 pode precisar de Graphify real (host) |

## Atualizar ao avançar

| Campo | Valor a registrar |
| --- | --- |
| Commit e branch atuais | Hash completo ou curto e branch |
| Alterações locais | Arquivos e autoria conhecida |
| Última tarefa concluída | ID e evidência |
| Tarefa em andamento | ID, resultado parcial e o que falta |
| Operações em curso | ID, recurso criado e estado observado |
| Decisões | Escolha, motivo e arquivo de contrato |
| Verificação | Comando, resultado e limite do ensaio |
| Próxima ação exata | Arquivo ou comando a verificar antes de mudar |
| Bloqueios | Condição objetiva e trabalho independente disponível |

Se o checkout mudou, registrar o novo estado e resolver as diferenças antes de seguir. Manter este documento atualizado por subtarefa para permitir retomada depois de interrupção ou falta de contexto.
