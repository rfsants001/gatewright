# Checkpoint da implementação

## Referência inicial

- Data da preparação do pacote em 20/11/2026.
- Base observada b2dfd32.
- Branch observada main, sincronizada no último trabalho.
- Interface proposta disponível em ui/dist/index.html.
- Nenhuma fase de lógica deste pacote iniciada pelo Codex.
- SDD de implementação a ser criado pelo Claude na P0.

## Estado atual

**P0, P1 e o núcleo+bridge de P2 concluídos e commitados.** Falta **P2-005** (renderer da tela de Integrações/saúde) e **P2-004b** (deferido: streaming por-etapa fino + evidência rica + remoção por recurso). Próxima ação: **P2-005**.

### Registro por subtarefa

| Campo | Valor |
| --- | --- |
| Commit e branch atuais | `6337ad0` (HEAD) · branch `main` |
| Alterações locais | tasks.md P2-001/002/003 `[x]`, P2-004 `[~]` parcial; este CHECKPOINT. `.specs/` é gitignored |
| Última tarefa concluída | **P2 núcleo+bridge** — `dca7c51` (operations.ts), `6f34740` (health.ts + diagnóstico com latência/DiagnosticResult), `6337ad0` (bridge: consolida customize→applyIntegration + lock por revisão; operação persistida por recipe + `integration.operation.get` + `snapshot.operations` + eventos `integration.progress`; `integration.test` grava health e retorna HealthStatus) |
| Tarefa em andamento | nenhuma — iniciar P2-005 (renderer) |
| Decisões | Ver `sdd/design.md` §8. P2: operação só p/ kinds de receita (npm-mcp/container/git-project/graphify); status grosso (applyIntegration é atômico); warning do último write de journal não é replicável via core (gap documentado no bridge) |
| Verificação | `npm run typecheck` + `npm test` = **926 testes verdes** (122 arquivos). Nota: `src/ui/flow-screen.test.tsx` (ink/TUI) é **flaky** sob carga paralela — passa isolado; re-rodar se falhar sozinho |
| Próxima ação exata | **P2-005**: renderer da tela Integrações (`?view=install`) — etapas rotuladas da operação (consumir `snapshot.operations` + evento `integration.progress` + `integration.operation.get`), coluna origem/versão/destino/escopo/pré-requisitos, saúde (`integration.test` agora retorna `HealthStatus` com verification/latencyMs/errorCode/actions), falha parcial + "testar conexão" (não reinstala). Ajuda (autenticação, revisão vencida). Ver `screens/05-instalacao.png` e `06-falha-parcial.png`, prévia `ui/preview.jsx` `?view=install`, `sdd/design.md` §2 |
| Bloqueios | **Validação visual/pixel pendente** (P1 e P2 — precisa `npm run desktop:dev` em sessão gráfica). **P2-004b deferido**: streaming por-etapa pelos installers + evidência rica + remoção/compensação por recurso + retomada reconciliando recurso real. P5 pode precisar de Graphify real (host) |

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
