# Checkpoint da implementação

## Referência inicial

- Data da preparação do pacote em 20/11/2026.
- Base observada b2dfd32.
- Branch observada main, sincronizada no último trabalho.
- Interface proposta disponível em ui/dist/index.html.
- Nenhuma fase de lógica deste pacote iniciada pelo Codex.
- SDD de implementação a ser criado pelo Claude na P0.

## Estado atual

**P0 concluída.** SDD escrito em `sdd/{spec,design,tasks}.md` com inventário dos contratos reais (design.md §0), matriz REQ→contrato→tela→teste e plano de tarefas P1..P7. Próxima fase: **P1 (Skills e ficha de agentes)**, começando por **P1-001** (estender `AgentProfile`/`agentSchema` com campos opcionais + compat legado).

### Registro por subtarefa

| Campo | Valor |
| --- | --- |
| Commit e branch atuais | `328a646` + commit do SDD · branch `main` |
| Alterações locais | SDD novo em `sdd/`; CHECKPOINT atualizado. `.specs/` é gitignored |
| Última tarefa concluída | P0-001/002/003 (pacote lido, inventário via 3 subagents Explore, SDD escrito) |
| Tarefa em andamento | P0-004 (commit do SDD) → depois P1-001 |
| Decisões | Ver `sdd/design.md` §8 (campos opcionais+migração aditiva, fonte única `composeAgent`, operações em journal por-id, confirmação 2-passos+lock, memória com tombstone, CodeMap domínio próprio, atribuição no início do run, métodos de bridge próprios p/ listas) |
| Verificação | Inventário read-only (sem mudança de código ainda); base = 849 testes |
| Próxima ação exata | Commitar `sdd/` → iniciar P1-001 em `src/core/skills/agents.ts` (estender `agentSchema`) |
| Bloqueios | P5 pode precisar de Graphify real (host) — registrar pendência quando chegar |

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
