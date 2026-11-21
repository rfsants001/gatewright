# SDD · Evolução do desktop Gatewright — Spec

> Continuação de 21/11: P0–P7 e P2-004b estão concluídas. Codex com escrita governada, empacotamento e ícones atuais foram acrescentados depois. Leia [o adendo Codex](../CODEX-PARITY.md) e o checkpoint antes de retomar; o texto de planejamento abaixo preserva a referência das fases originais.

> Fonte de produto: `../PRD.md`. Fonte técnica: `../TRD.md`. Telas: `../UI-SPEC.md` + `../screens/`. Fases: `../PHASES.md`.
> Base inspecionada: `328a646` (main) sobre R2 (`10a059b`/`77b789d`/`328a646`). Inventário do código real feito em P0 — ver `design.md` §0 para os contratos atuais.
> Este documento fixa requisitos rastreáveis e a matriz REQ → contrato → tela → teste → evidência. Os aceites de produto do PRD são autoritativos; aqui eles ganham contrato e tarefa.

## Aceite implementado em 21/11/2026

P0–P7 e P2-004b entregues, com a evidência consolidada em [CHECKPOINT.md](../CHECKPOINT.md) e [tasks.md](tasks.md). A matriz abaixo foi a referência do SDD; os nomes concretos finais e a semântica dos DTOs estão em [TRD.md](../TRD.md#contratos-entregues). Os testes reais correspondentes estão registrados no final de tasks.md. A prévia `?view=` não é o roteamento do Electron: a produção usa navegação React e bridge.


## 1. Objetivo

Transformar as telas aprovadas (prévia em `../ui/dist/index.html`) em fluxos funcionais do desktop Electron, com a lógica no runtime (`src/core`) e no bridge (`src/desktop/bridge.ts`), consumível também por clientes MCP quando aplicável. Preservar as seis áreas de navegação (Projeto, Tarefas, Custos, Integrações, Agentes, Skills); Projeto ganha as abas **Pendências**, **Memória** e **Mapa**. Nenhuma funcionalidade existente pode regredir; MCP e harness continuam funcionando com a janela fechada.

## 2. Entidades novas ou ampliadas

| Entidade | Situação atual | Mudança | Fase |
| --- | --- | --- | --- |
| `SkillFrontmatter` / `Skill` | `{name,description,triggers,skillKind,metadata}` + body | Campos **opcionais** `category` (ou mapeamento de `skillKind`), `responsibilities?`, `expectedInput?`, `expectedOutput?`, `boundaries?`; `origin`/`source` **derivados pelo catálogo** (não no frontmatter) | P1 |
| `AgentProfile` (`agentSchema` strict) | `{id,name,goal,skills[]}` | Campos **opcionais** `responsibilities?`, `expectedInput?`, `expectedOutput?`, `boundaries?` + `schemaVersion?`; perfis legados continuam válidos | P1 |
| Agente — operações | só `saveAgent` (create-only) | `updateAgent` (sem contornar proteção de id), `deleteAgent`; dependentes derivados de `projectAgents` | P1 |
| `IntegrationOperation` | journal ad-hoc `integrations.json` (eventos de proposta) | Operação persistente `{id,cwd,revision,recipeKind,status,steps[],evidence,timestamps}` com eventos por etapa e reconciliação | P2 |
| `HealthStatus` | `integration.test` (handshake pontual) | DTO `{configured,artifactReady,lastAttemptAt,verification,latencyMs,checkedRevision,errorCode,actions}` persistido | P2 |
| `PendingItem` (projeção) | inexistente | Projeção de leitura sobre Flow + runs + operações de integração; identidade `{type,entity,revision}` | P3 |
| `MemoryRecord` | inexistente | Domínio novo `src/core/memory/` versionado `{id,title,body,type,scope,projectId?,runId?,origin,recipients?,version,timestamps}` | P4 |
| `MemorySnapshot` (por run) | inexistente | Congela IDs+versões+texto no preparo do run | P4 |
| `CodeMap` (Graphify) | só readiness (`graph.json` existe?) | Adapter/parser de `graphify-out/graph.json`, normalização, última-versão-válida, relação com diff | P5 |
| Metadados de custo no run | `CONTROL_STATE_CHANGED.meta` nunca populado | Gravar `{agentId?,providerId?,integrationIds?,attributionSource}` no início do run; agrupar custos | P6 |
| Ajuda contextual | inexistente | Conteúdo local por `{screenId,action,errorCode}` em drawer | P7 (entregue incrementalmente por fase) |

## 3. Requisitos (aceites do PRD, com âncora de contrato)

Os textos de aceite são os do PRD §"Requisitos e aceites". Abaixo, cada grupo recebe o(s) contrato(s) e a fase. A matriz completa REQ→contrato→tela→teste está em §6.

- **SK-01..04** (Skills): busca/filtro por categoria e origem, detalhe com corpo+origem, dependentes com link, criação e ocultação de `_system/`. Contratos: `skills.list`, `skills.detail`. Fase P1.
- **AG-01..05** (Agentes): ficha opcional persistida, abas Ficha/Skills/Instruções, reordenação salva, composição única (prévia=execução=Flow=MCP), limites no contexto, snapshot imutável no Flow. Contratos: `agent.update`, `agents.delete`, `composeAgent` estendido. Fase P1.
- **IN-01..06** (Integrações): propor/revisar/aplicar/acompanhar por etapa, estados de saúde, retry que testa de verdade, retomada que reconcilia, ação recuperável em falha parcial, preservar receitas e caminho MCP do R2. Contratos: snapshot.operations, `integrations.operation.get`,  `integration.test` estendido. Fase P2.
- **PE-01..03** (Pendências): projeção de aprovações/interrupções/falhas acionáveis, ação+vínculo por linha, retomada revalidada (fecha FDR-007). Contratos: `pending.list`, `pending.open`, `flow.resume` (allowlist), `review`/`review.decide`. Fase P3.
- **ME-01..05** (Memória): CRUD versionado por tipo e escopo, origem/associação, destinatários+seleção no compositor, snapshot por run, erro de orçamento antes de iniciar. Contratos: `memory.list/upsert/delete/resolve`. Fase P4.
- **MP-01..04** (Mapa): grafo validado do Graphify com origem/data, mapa+lista equivalentes, seleção revela arquivo+vínculos, relação com diff, ausência oferece conectar/instalar/gerar. Contratos: `projectMap.get`, `projectMap.refresh`, `projectMap.openFile`. Fase P5.
- **CU-01..04** (Custos): agrupar por agente/provedor/tarefa/integração, atribuição só quando registrada (senão "Sem atribuição"), preservar reportado/estimado/sem preço, integração = uso atribuído à execução (sem dupla contagem). Contratos: `aggregateUsage` estendido + metadados de run. Fase P6.
- **AJ-01..03** (Ajuda): drawer por tela/campo/erro, foco contido + Escape + retorno, sem perder projeto. Contrato: conteúdo local + `help` DTO. Entregue por fase; consolidado em P7.

## 4. Cross-cutting (obrigatório em toda fase)

- **Concorrência / troca de projeto**: toda ação valida `cwd === selected` (guard `assertProject`). Respostas atrasadas de outro projeto são descartadas no renderer (comparar `cwd` ao `cwdRef` atual). Confirmação consumida não dispara duas receitas (exclusão mútua por revisão).
- **Falhas parciais**: efeito aplicado + journal que falha → retornar estado aplicado com registro incompleto, nunca incentivar repetição cega. IDs de recurso (contêiner, pasta, versão, revisão MCP) persistidos antes de repetir etapa.
- **Imutabilidade de snapshot**: editar/excluir skill, agente ou memória não altera o snapshot de um Flow/run já iniciado.
- **Acessibilidade (UI-SPEC §Acessibilidade)**: 1 h1 por área, tabelas com cabeçalho, inputs com label, foco visível e por teclado, drawer com foco contido + Escape + retorno ao acionador, `aria-busy` em loading, sem remontar formulário em atualização de snapshot. Alvos de largura 1440×960, 1120×860, 780×580.
- **Estados por recurso**: com dados, carregando, vazio (específico do domínio), erro recuperável, parcial. Mensagem de erro indica efeito observado + ação disponível.
- **Segurança Electron**: abrir arquivo só via ação explícita, caminho canônico dentro da pasta autorizada, sem afrouxar sandbox/allowlist para teste verde.

## 5. Matriz de validação (como cada fase é aceita)

Validação pela **entrada normal do produto** (`npm run desktop:dev -- <projeto descartável>`), não por arquivos isolados que compilam. Comando de checagem com registro isolado:

```sh
validation_dir=$(mktemp -d /tmp/gatewright-validation-XXXXXX)
GATEWRIGHT_PROJECTS="$validation_dir/projects.json" npm run check   # typecheck + build + vitest
```

Smoke do Electron: `npm run test:desktop` (sessão gráfica). Quando o ambiente bloquear um ensaio real de host, registrar o erro, manter o aceite como **pendente** e fazer os checks independentes. Não desabilitar isolamento.

## 6. Matriz de rastreabilidade REQ → contrato → tela → teste → evidência

| REQ | Contrato (bridge/MCP/core) | Tela (`?view=`) | Teste | Evidência de aceite |
| --- | --- | --- | --- | --- |
| SK-01 | `skills.list({query,category,origin})` | skills | `skills-list.test` (filtro/contagem/limpar) | Busca retorna subset; limpar recupera lista |
| SK-02 | `skills.detail({name})` | skills | `skills-detail.test` | Corpo+id+origem; categoria de `skillKind`/mapa |
| SK-03 | dependentes via `projectAgents` | skills→agents | `skills-dependents.test` | Link ao perfil; skill ausente → aviso |
| SK-04 | `skill.save` (preservado) + filtro `_system/` | skills | `catalog` existente + `system-filter.test` | `_system/` oculto no catálogo e ajuda |
| AG-01 | `agentSchema` estendido + `updateAgent` | agents | `agent-legacy.test` | Perfil legado edita/executa; campos opcionais persistem |
| AG-02 | snapshot estendido | agents (Ficha/Skills/Instruções) | `agent-tabs.test` | Instruções refletem campos+ordem |
| AG-03 | `agent.update` (reorder) + `composeAgent` | agents | `agent-reorder.test` | Ordem salva; prévia==execução |
| AG-04 | `run`/`flow.start` com `agentId` (existe) | agents→tasks | `agent-use-task.test` | Perfil vai ao compositor |
| AG-05 | `composeAgent` inclui `boundaries` | agents | `agent-compose.test` | Limites no contexto; harness preservado |
| IN-01..02 | snapshot.operations, `HealthStatus` | install | `integration-op.test` | Etapas rotuladas; saúde diferenciada |
| IN-03 |  `integration.test` | install | `retry-no-reinstall.test` | Retry testa; não reinstala/duplica |
| IN-04..05 | `integration.operation.get` + evento `integration.progress` | install | `op-reopen.test`, `partial-failure.test` | Reabrir reconstrói; falha parcial recuperável |
| IN-06 | core R2 (`proposeIntegration`/`applyIntegration`) + MCP | install | `mcp-path.test` (existe) | Receitas e caminho MCP preservados |
| PE-01..02 | `pending.list` | pending | `pending-projection.test` | Linhas com ação+vínculo; contagem segue filtro |
| PE-03 | `flow.resume` + revalidação | pending | `bridge.resume.test` (estende) + e2e | Retomada sem 2ª execução; revisão obsoleta reabre |
| ME-01..02 | `memory.upsert`, `memory.list` | memory | `memory-crud.test` | CRUD por tipo/escopo; origem/associação |
| ME-03..04 | `memory.resolve` + snapshot no run | memory→tasks | `memory-snapshot.test`, `memory-isolation.test` | A não vaza em B; editar pós-início não muda prompt |
| ME-05 | checagem de orçamento no preparo | tasks | `memory-budget.test` | Erro de limite antes de iniciar |
| MP-01..02 | `projectMap.get`, `projectMap.openFile` | map | `codemap-adapter.test` | Grafo válido; abrir arquivo respeita pasta |
| MP-03 | relação diff↔grafo | map | `codemap-diff.test` | Nós ligados a arquivos alterados |
| MP-04 | `projectMap.refresh` | map | `codemap-refresh.test` | Ausente/ inválido preserva última válida |
| CU-01..02 | `aggregateUsage` + agrupamentos | costs | `usage-group.test` | Soma filtrada == total; "Sem atribuição" |
| CU-03..04 | preço reportado/estimado/sem + regra de integração | costs | `usage-attribution.test` | Sem dupla contagem; parcial informado |
| AJ-01..03 | conteúdo de ajuda + drawer | help (todas) | `help-drawer.test` | Foco contido; Escape; projeto preservado |

## 7. Fora de escopo nesta entrega

Medição de usuários reais; cobrança/assinatura de SaaS sem fonte própria; edição de skill distribuída (só variante de projeto, se e quando uma fase futura o pedir); mudança do limite de 20 KB do prompt sem validação nos hosts.
