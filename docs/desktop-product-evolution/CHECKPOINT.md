# Checkpoint da implementação

## Referência inicial

- Data da preparação do pacote em 20/11/2026.
- Base observada b2dfd32.
- Branch observada main, sincronizada no último trabalho.
- Interface proposta disponível em ui/dist/index.html.
- Nenhuma fase de lógica deste pacote iniciada pelo Codex.
- SDD de implementação a ser criado pelo Claude na P0.

## Estado atual

**P0, P1 e P2 concluídas e commitadas** (P2-004b deferido). Próxima fase: **P3 (Pendências e retomada — fecha FDR-007)**, começando pela onda FDR-007 (P3-001/002/003), depois P3-004 (projeção `pending.list` + tela).

### Registro por subtarefa

| Campo | Valor |
| --- | --- |
| Commit e branch atuais | `169bc8c` (HEAD) · branch `main` — FDR-007 (P3-001/002/003) pronto |
| Alterações locais | tasks.md P2 `[x]` (P2-004 `[~]`); este CHECKPOINT. `.specs/` é gitignored |
| Última tarefa concluída | **P2 inteira** — `dca7c51` (operations.ts), `6f34740` (health.ts+diagnóstico), `6337ad0` (bridge apply-flow), `a909c24` (renderer IntegrationsPage: review→apply por operação+eventos progress com seq-guard, health+testar conexão, falha parcial, ajuda) |
| Tarefa em andamento | nenhuma — iniciar P3 (FDR-007) |
| Decisões | Ver `sdd/design.md` §8 e §3 (FDR-007) |
| Verificação | `npm run typecheck` + `npm run build` + `npm test` = **926 testes verdes** (122 arquivos). `src/ui/flow-screen.test.tsx` (ink) **flaky** sob carga — re-rodar isolado se falhar sozinho |
| Próxima ação exata | **P3-004**: `src/core/pending/projection.ts` — projeção `pending.list` derivando de 3 fontes: (a) flow-state.json com segmento FLOW_START sem TERMINAL → item `resumable-run`/`resumable-ask`; (b) runs concluídos sem decisão de review (ver marcador de `review.decide` no run-journal) → item `review`; (c) `listOperations(cwd)` com status `failed`/`partial` → item `integration-failure`. Identidade `{kind,entity,revision}`; item some ao mudar a fonte. + bridge `pending.list` + allowlist `main.mjs` + tela Pendências (`?view=pending`): contagem por tipo, filtros, ação+vínculo (abrir revisão / abrir projeto p/ retomar / ir ao diagnóstico). Ref `screens/01-pendencias.png`, prévia `?view=pending`, `sdd/design.md` §3. **FDR-007 e2e de restart do Electron fica pendente de GUI.** |
| Bloqueios | **Validação visual/pixel pendente** (P1/P2). **P2-004b deferido**. e2e de restart do Electron pode precisar de sessão gráfica. P5 pode precisar de Graphify real |

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
