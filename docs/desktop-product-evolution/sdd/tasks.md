# SDD · Evolução do desktop Gatewright — Tasks

> Ordem P0→P7 com dependências de `../PHASES.md`. Cada tarefa é atômica (1 commit, Conventional, **sem Co-authored-by**). "Done when" é o critério objetivo; aceite de produto é validado pela entrada normal do desktop (ver `spec.md` §5/§6). Marcar `[x]` só com evidência. Atualizar `../CHECKPOINT.md` a cada subtarefa.
>
> Legenda de dependência: cada fase depende de P0; dependências extras anotadas por tarefa.

## P0 — Inventário e SDD  ✅

- [x] **P0-001** Ler o pacote (PRD/TRD/UI-SPEC/PHASES/README/CLAUDE-PROMPT) e conferir base.
- [x] **P0-002** Inventariar contratos reais (skills/agents, bridge/IPC/flow, custos/grafos/memória/journal) — `design.md` §0.
- [x] **P0-003** Escrever `spec.md`, `design.md`, `tasks.md` com matriz REQ→contrato→tela→teste.
- [x] **P0-004** Commitar o SDD e atualizar `CHECKPOINT.md` com a primeira tarefa da P1. → `docs(sdd): inventory and SDD for desktop evolution`

## P1 — Skills e ficha de agentes  (REQ SK-01..04, AG-01..05)

- [x] **P1-001** Estender `AgentProfile`/`agentSchema` com campos opcionais (`responsibilities/expectedInput/expectedOutput/boundaries`, `schemaVersion?`). Atualizar tipos e leitores. Perfil legado continua válido.
  - Done when: schema strict aceita perfil antigo e novo; `projectAgents` não descarta legado; teste `agent-legacy`. → `feat(agents): optional profile fields with legacy compat`
- [x] **P1-002** `composeAgent` anexa bloco determinístico dos campos novos (antes das skills, dentro de 20 KB). Fonte única preservada.
  - Done when: prévia==execução==prompt MCP; `agentPrompt` do Flow inalterado no início; teste `agent-compose`. Dep: P1-001. → `feat(agents): compose profile fields into single prompt`
- [x] **P1-003** `updateAgent` + `deleteAgent` no core (update exige id existente, sem contornar proteção anti-duplicata). Bridge `agent.update`/`agent.delete` + allowlist `main.mjs`.
  - Done when: reordenar/editar salva e persiste ordem ao reabrir; excluir remove; teste `agent-reorder`. Dep: P1-001. → `feat(agents): update and delete operations`
- [x] **P1-004** `skills.list`/`skills.detail` no bridge (busca, `category`, `origin`, `dependents`, `invalid`) + filtro `_system/` em todo caminho público. Allowlist.
  - Done when: filtro por nome/categoria/origem; contagem derivada; limpar recupera; `_system/` oculto; arquivo inválido não derruba a tela; teste `skills-list`/`skills-detail`/`system-filter`. → `feat(skills): searchable catalog with origin and dependents`
- [x] **P1-005** Renderer: tela Skills (busca/tabela/detalhe/dependentes com link ao agente) e tela Agentes (abas Ficha/Skills/Instruções, reorder por teclado, "Usar em tarefa"). Ajuda desses fluxos. Captura com dados de teste.
  - Done when: fluxo completo pela janela; a11y (foco/teclado/labels); SK/AG aceites exercitados. Dep: P1-002..004. → `feat(desktop): skills library and agent profile screens`

## P2 — Operações de integração e saúde  (REQ IN-01..06)

- [x] **P2-001** Domínio `IntegrationOperation` (`src/core/integrations/operations.ts`): journal por-id, eventos `OP_STEP`, snapshot por `project`, evidência por efeito.
  - Done when: criar/avançar/reconstituir operação em fixture; etapa `running` reconciliável; teste `integration-op`. → `feat(integrations): persistent operation with step journal`
- [x] **P2-002** Consolidar `customize.propose/apply` do bridge sobre `proposeIntegration/applyIntegration` (core R2) preservando mensagens/guard/cache/journal. Lock por revisão contra confirmação concorrente (bridge + cache MCP de `integrate_tool`).
  - Done when: comportamento observável idêntico; confirmação consumida não dispara 2 receitas; teste `op-concurrent`. Dep: P2-001. → `refactor(integrations): bridge delegates to shared R2 configurator`
- [x] **P2-003** `HealthStatus` + `integration.test` estendido (tentativa/horário/fase/erro/latência; retry testa sem reinstalar; evidência expira por revisão). Evento `integration.progress {cwd,operationId,seq,step}`.
  - Done when: instalado-não-verificado distinto; retry não reinstala/duplica; teste `retry-no-reinstall`/`partial-failure`. Dep: P2-001. → `feat(integrations): health status and real connection retry`
- [~] **P2-004** `integration.operation.get` (reabrir reconstrói pelo id) + ação recuperável/remoção por recurso pertencente. Allowlist.
  - Done when: reabrir projeto recupera estado; remover/reverter identifica recursos da operação; teste `op-reopen`. Dep: P2-001. → `feat(integrations): reopen and recover operations`
  - **Parcial (entregue):** operação persistida por recipe, `integration.operation.get`, `snapshot.operations` p/ reabrir, eventos `integration.progress` (status grosso), lock por revisão. **Deferido (P2-004b):** streaming por-etapa fino (threading de um reporter de passo pelos installers `integration-install.ts`), evidência rica por efeito (containerId/pasta/versão lidos do resultado do installer), e remoção/compensação por recurso pertencente. `applyIntegration` é atômico hoje → só status grosso succeeded/failed. Retomar operação interrompida reconciliando recurso real também entra aqui.
- [x] **P2-005** Renderer: tela Integrações (etapas rotuladas, coluna origem/versão/destino/escopo/pré-requisitos/verificações, falha parcial + testar conexão). Ajuda (autenticação, revisão vencida). Captura.
  - Done when: progresso real de uma receita + recuperação reproduzível; IN aceites. Dep: P2-002..004. → `feat(desktop): integration install and health screen`

## P3 — Pendências e retomada  (REQ PE-01..03, fecha FDR-007)

- [x] **P3-001** `flow.resume` na allowlist de `main.mjs`; `Bridge.busy`/fechamento consideram flow restaurado; `inFlow` no resume.
  - Done when: `flow.resume` chega ao bridge; guarda de fechamento reflete trabalho restaurado; teste de allowlist. → `fix(desktop): allow flow.resume and busy on restored flow`
- [x] **P3-002** Corrigir ordem de eventos do `flow.ask` recuperado (entregar via retorno do `open`/enfileirar até seleção da pasta); `app.jsx open()` consome `resumableFlow` antes de escrever `cwdRef`.
  - Done when: `flow.ask` recuperado não é descartado na abertura/troca de pasta; `pendingAsk:false` mostra problema+encerrar; estende `bridge.resume.test`. Dep: P3-001. → `fix(flow): deliver recovered ask after project selected (FDR-007)`
- [x] **P3-003** UI de retomada em `app.jsx` (`atKind:"run"` título+Retomar/Encerrar, run só após confirmação; reconciliação de incerteza pós-crash).
  - Done when: retomar não dispara 2ª execução; run ativo/diff alterado/Flow encerrado cobertos; e2e Electron mesma cwd entre reinícios. Validado no smoke de 21/11 para revisão recuperada e run aguardando ação. Dep: P3-002. → `feat(desktop): resume paused flow from window (FDR-007)`
- [x] **P3-004** Projeção `pending.list` (`src/core/pending/projection.ts`) + bridge `pending.list` + tela Pendências (contagem por tipo, filtros, ação+vínculo).
  - Done when: deriva de revisões/runs/operações; item resolvido some; filtrar não altera entidades; teste `pending-projection`. Dep: P2, P3-001. → `feat(pending): projection and screen over runtime sources`
  - Entrega de 21/11: tela Projeto → Pendências, filtros e contagens, pending.open com revisão atual, ação de diff para o run correto e diagnóstico por operationId. Revisão de Flow avança sua versão e seus outputs não duplicam revisões avulsas. Regressão e smoke real do Electron registrados em ../screens/validation-2026-11-21/README.md.

## P4 — Memória e contexto  (REQ ME-01..05)  — Dep: P1, P3

- [ ] **P4-001** `src/core/memory/` — `MemoryStore` (Journal+ArtifactStore), schema versionado, escopos user/project/run, migração explícita, tombstone de exclusão.
  - Done when: CRUD versionado; isolamento de projeto; teste `memory-crud`/`memory-isolation`. → `feat(memory): versioned record store with scopes`
- [ ] **P4-002** `memory.resolve` → `MemorySnapshot` (IDs/versões/texto) no preparo do run; checagem de orçamento de contexto antes de iniciar; imutável após início.
  - Done when: editar pós-início não muda prompt; excesso de contexto erra antes de iniciar; teste `memory-snapshot`/`memory-budget`. Dep: P4-001. → `feat(memory): run snapshot and context budget`
- [ ] **P4-003** Bridge+MCP `memory.list/upsert/delete/resolve` (mesmos limites de escopo); destinatários por perfil; sugestão de IA exige salvar versão revisada. Allowlist.
  - Done when: desktop e caminho MCP compartilham resolução; teste `memory-mcp`. Dep: P4-001. → `feat(memory): bridge and MCP contracts`
- [ ] **P4-004** Renderer: tela Memória (escopos, busca, lista, origem/destinatários, drawer criar/editar, exclusão com decisão) + seleção no compositor da tarefa. Ajuda de privacidade. Captura.
  - Done when: criar→selecionar→usar no run→recuperar no histórico com versão original; ME aceites. Dep: P4-002..003. → `feat(desktop): memory screen and task context selection`

## P5 — Mapa de código e diff  (REQ MP-01..04)  — Dep: P2 + Graphify funcional

- [ ] **P5-001** Conferir schema real de `graphify-out/graph.json` na versão suportada; fixar fixture representativa se o CLI não rodar no ambiente (registrar pendência de host).
  - Done when: exemplo real ou fixture + nota de limitação no CHECKPOINT. → `test(codemap): capture real graphify graph fixture`
- [ ] **P5-002** `src/core/codemap/` — adapter/parser + normalização, limites antes de parsear, última-versão-válida, `truncated`.
  - Done when: grafo válido/inválido/grande/desatualizado cobertos; preserva última válida; teste `codemap-adapter`. Dep: P5-001. → `feat(codemap): graphify adapter with limits`
- [ ] **P5-003** Relação diff↔grafo (paths normalizados Linux/macOS/Windows, renomes) + `projectMap.openFile` (canônico, dentro da pasta, ação Electron). `projectMap.get`/`refresh` (progresso P2).
  - Done when: nó ligado a arquivo alterado; abrir fora da pasta bloqueado; teste `codemap-diff`/`codemap-refresh`. Dep: P5-002, P2. → `feat(codemap): diff relation and guarded open file`
- [ ] **P5-004** Renderer: tela Mapa (alternância mapa/lista equivalente por teclado, seleção+relações, detalhe do diff, ausência oferece conectar/instalar/gerar). Ajuda (gráfico ausente). Captura.
  - Done when: módulo selecionável em lista e mapa; refresh observável; MP aceites. Dep: P5-003. → `feat(desktop): project map screen`

## P6 — Custos por atribuição  (REQ CU-01..04)  — Dep: P1, P2

- [ ] **P6-001** Gravar metadados de atribuição no início do run (`meta`: agentId/providerId/integrationIds/attributionSource). Distinguir uso efetivo × contexto habilitado.
  - Done when: run novo carrega metadados; legado sem metadados continua válido; teste `run-attribution-meta`. → `feat(costs): record attribution metadata at run start`
- [ ] **P6-002** `aggregateUsage` estendido (agrupar por agent/provider/task/integration; DTO `{knownSumBrl,pricedCount,unpricedCount}`; "Sem atribuição"; sem dupla contagem por integração). Reusa reconciliação cumulativa.
  - Done when: soma filtrada == total; múltiplas integrações não duplicam; zero/parcial/estimado/reportado preservados; teste `usage-group`/`usage-attribution`. Dep: P6-001. → `feat(costs): attribution grouping without double counting`
- [ ] **P6-003** Renderer: Custos (seletor de dimensão, barras do novo agrupamento + gráficos por dia/modelo existentes, tabela, drawer do run com fonte+metadados+"Abrir tarefa", período único). Ajuda (custo desconhecido). Captura.
  - Done when: navegação gráfico→tarefa pela janela; período único em todas as vistas; CU aceites. Dep: P6-002. → `feat(desktop): cost attribution screen`

## P7 — Ajuda e aceite completo  (REQ AJ-01..03 + estados)  — Dep: P1..P6

- [ ] **P7-001** Consolidar conteúdo de ajuda por `{screenId,action,errorCode}` + drawer (foco contido, Escape, retorno ao acionador, projeto preservado). Revisar links/erros de todas as fases.
  - Done when: navegar ajuda não perde projeto; teste `help-drawer`; AJ aceites. → `feat(desktop): contextual help drawer`
- [ ] **P7-002** Estados comuns por área (dados/carregando/vazio específico/erro recuperável/parcial, `aria-busy`), revisão a11y em 1440×960/1120×860/780×580, descartar resposta de projeto trocado.
  - Done when: janela pequena alcança ações por teclado; estados cobertos; teste de estados. → `feat(desktop): shared states and accessibility pass`
- [ ] **P7-003** Regressão final: `GATEWRIGHT_PROJECTS=tmp npm run check` + `npm run test:desktop` (smoke) + screenshots reais; registrar hosts/versões e pendências de host; atualizar README conforme autorização vigente.
  - Done when: checks verdes (ou limitações registradas), evidências capturadas, handoff no CHECKPOINT. → `docs(desktop): evolution acceptance and README update`

## Dependências resumidas
P0 → P1 → {P2 → (P3, P5), P6}; P4 depende de P1+P3; P7 depende de todas. P3-004 e P5/P6 consomem a operação persistente da P2.
