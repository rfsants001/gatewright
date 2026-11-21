# Checkpoint da implementação

Atualizado em 21/11/2026 pelo Codex. A base recebida do Claude foi 27a393d. A continuação de código está em d0441e4, na branch main. Consulte git status e git log para identificar commits posteriores e alterações concorrentes.

## Estado atual

- P0 e P1 implementadas pelo Claude.
- P2 funcional, com P2-004b ainda pendente. Progresso fino dos instaladores, evidências por efeito, compensação e reconciliação de recursos continuam nesse item.
- P3 concluída. A projeção de 27a393d foi ligada à aba Projeto → Pendências, com abertura revalidada de revisão e diagnóstico da operação.
- FDR-007 exercitada na janela real em reinícios do Electron na mesma pasta, com ask recuperada e run aguardando ação.
- P4, P5, P6 e a consolidação P7 continuam pendentes no SDD.

## Registro da continuação

| Campo | Resultado |
| --- | --- |
| Código da entrega | d0441e4 · feat(desktop): connect pending actions and validate recovered flows |
| Última tarefa concluída | P3-004, incluindo tela, filtros, contagens, pending.open e diagnóstico por operationId |
| Contratos ligados | pending.list, pending.open, review, review.decide, flow.resume e flow.stop |
| Correções de revisão | Versão do Flow segue o journal atual. Runs do Flow usam sua própria revisão e não duplicam aprovações avulsas. Ação de pendência exige identidade e revisão atuais |
| Execução concorrente | flow.resume recusa nova chamada enquanto existir run ativo. A lista omite retomadas durante execução ativa |
| Validação automatizada | npm run check com registro temporário de projetos passou em 946 testes, 123 arquivos |
| Validação da janela | npm run test:desktop e npm run test:desktop:pending passaram no Linux, Node 24.16.0, Electron 45.3.1 |
| Evidência visual | screens/validation-2026-11-21/README.md e capturas da janela real |
| Limites do ensaio | Repositório e journals de fixture, sem execução de modelo. Ensaios autenticados por host e reconciliação de efeitos externos continuam nas respectivas trilhas |
| Arquivos principais | desktop/renderer/pending.jsx, desktop/renderer/app.jsx, src/core/pending/projection.ts, src/desktop/bridge.ts, desktop/pending-smoke.mjs |

## Próxima ação exata

Iniciar P4-001, Memória e contexto. Ler o capítulo P4 de sdd/design.md e os aceites ME-01 a ME-05 em PRD.md. Conferir o schema atual de AgentProfile, composeAgent, a persistência de agentPrompt em FLOW_START, ArtifactStore e Journal. Depois implementar src/core/memory com schema versionado, isolamento de escopos, revisão de edição e exclusão por tombstone.

O primeiro teste deve demonstrar CRUD com versão e isolamento entre dois projetos. Em seguida seguir P4-002 para resolver um snapshot imutável no preparo do run, P4-003 para bridge/MCP e P4-004 para a tela e a seleção no compositor. A prévia de design em ui/ permanece como referência visual.

A pendência P2-004b precisa continuar visível. A tela de operação apresenta apenas os eventos que o instalador registrou. Não assumir que todos os efeitos externos já têm evidência suficiente para repetição ou remoção automática.

## Protocolo de retomada

Antes de alterar o projeto, conferir o estado real, os commits posteriores e os efeitos de operações interrompidas. Registrar a tarefa em andamento, arquivos tocados, verificação executada, decisões e próxima ação após cada subtarefa. Atualizar sdd/tasks.md com evidência e preservar os documentos deste pacote em docs/desktop-product-evolution.
