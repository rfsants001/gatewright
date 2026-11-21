# SDD · Evolução do desktop Gatewright — Design

> Continuação de 21/11: P0–P7 e P2-004b estão concluídas. Codex com escrita governada, empacotamento e ícones atuais foram acrescentados depois. Leia [o adendo Codex](../CODEX-PARITY.md) e o checkpoint antes de retomar; o texto de planejamento abaixo preserva a referência das fases originais.

> Companheiro de `spec.md`. §0 fixa os contratos **reais** inventariados em P0 (com `file:line`). §1+ descreve o design por fase: DTOs, schemas Zod, eventos, caminhos persistidos, snapshots, migração, concorrência, e o que o código já cobre × o que falta.

## Contratos finais da entrega de 21/11/2026

P0–P7 e P2-004b implementadas. As decisões e assinaturas finais estão em [TRD.md](../TRD.md#contratos-entregues), com evidências em [CHECKPOINT.md](../CHECKPOINT.md). O inventário P0 abaixo é histórico, anterior à implementação.

Decisões finais: memória em eventos imutáveis por versão publicados com compare-and-swap via hard link; `RUN_CONTEXT` como header dedicado; `FLOW_START.runContext` para retomada; snapshots com records completos, texto e bytes. Custos por integração são rateio explícito de contexto habilitado. O parser suporta `edges` legado do pacote Graphify 0.9.114 e `links` schema 1 do upstream. A geração usa `--out .`; `uv venv --allow-existing` preserva a marca de ownership. Operações ficam `reverted` após limpeza e compartilham mutex entre aplicação e recuperação. Ajuda usa dialog modal nativo. `run.list/detail` preserva acesso ao contexto mesmo sem medição.


## 0. Inventário da base (contratos reais, P0)

### Skills (`src/core/skills/`)
- `skill-doc.ts`: `parseSkill(md):Skill` (L17, lança `NO_FRONTMATTER`/`MISSING_FIELD`), `serializeSkill(skill):string` (L47, YAML `skill-kind:`).
- `types.ts`: `SkillFrontmatter {name,description,triggers:string[],skillKind:string,metadata:Record<string,string>}` (L5), `Skill {frontmatter,body}`, `SkillError{code}` (`NO_FRONTMATTER|MISSING_FIELD|EXISTS`).
- `catalog.ts`: `SkillCatalog(root)` → `list()/problems()/resolve(name)/byCategory()` (agrupa por `skillKind`). `_system` filtrado por nome (L33/L40). Entrada exposta = `Skill` puro (sem origem/path).
- `gate-catalog.ts`: `loadGateSkills(dir?)`, `buildSkillsSystemPrompt(skills)`.
- `agents.ts`: `agentSchema` **strict** `{id:/^[a-z][a-z0-9-]{0,47}$/, name≤70, goal≤1000, skills[1..12] únicas}` (L7). `projectSkills(cwd):Map<string,Skill>` (merge bundled+projeto, projeto vence por nome, L18). `projectAgents(cwd):AgentProfile[]` (L23, `safeParse` filtra inválidos). `composeAgent(cwd,profile):string` (L30, lança em skill desconhecida, teto 20_000 bytes L38). `saveAgent(cwd,profile)` **create-only** (rejeita id duplicado, L44). **Não há** update/delete.

### Bridge / Electron (`src/desktop/bridge.ts`, `desktop/`)
- Dispatch (switch, exige `assertProject` = `cwd===selected`, L54): `snapshot`(L250), `terminal.preview/apply`, `provider.save`, `integration.test`(L289), `skill.save`(L293), `agent.preview/save`(L299), `customize.propose`(L306)/`apply`(L324), `review`(L347)/`review.decide`(L357), `flow.answer`(L369)/`flow.stop`(L396)/`run`|`flow.start`(L404)/`flow.resume`(L426). Fora do switch: `projects`,`cancel`,`open`(L150, isento de `assertProject`).
- Guards: `applying` (bloqueia tudo durante `customize.apply`), `active.size||flow` (bloqueia novo trabalho), `active.has(runId)` (bloqueia review de run vivo).
- Eventos push `send()` (`stdout`, sem id): `run.log`,`run.state`,`flow.done`,`flow.ask`,`flow.error`,`flow.run`.
- `desktop/main.mjs`: allowlist `methods` (L10) **sem `flow.resume`**; `Bridge.busy = #busy||#flow||installing||pending(run/flow.start)`; guarda de fechamento de janela.
- `desktop/preload.cjs`: expõe `request/chooseFolder/initialProject/onEvent`.
- Flow (`src/core/flow/`): `flow-journal.ts` tipos `FLOW_START|FLOW_RUN|FLOW_ANSWERS|FLOW_TERMINAL`; `openFlowJournal(cwd)`→`.gatewright/flow-state.json`. `flow.ts` `replayFlow(steps,goal,entries):{engine}|{drift,atIndex,expected,got}`. `open` reconstrói `inputs` e seta `resumableFlow {title,atKind:"run"|"ask",pendingAsk?}` (não auto-executa run).

### Custos (`src/core/run/`, `engine/`)
- `usage.ts`: `aggregateUsage(cwd,store?):UsageSnapshot` com `byModel/byRun/byDay`. Dedup cumulativo: evento `result`/`cumulative` substitui parciais (L94). Preço: `reported`(costUsd)→`estimated`(modelo conhecido)→`undefined`; `pricedCount`.
- `pricing.ts`: `PricingTable{usdToBrl:5.0, models:substring→{inputPerM,outputPerM,cacheReadPerM}}`, `estimateCost(...)`.
- Início de run: `CONTROL_STATE_CHANGED{from:"IDLE",to:"RUNNING",meta?:unknown}` — `meta` **nunca populado** (sem agent/provider/integration IDs hoje).
- UI: flui pelo `snapshot` (`data.usage`), `usage.jsx` `CostTimeline/Usage`.

### Grafos / Memória / Journal
- `graph/execution-graph.ts` (DAG runtime, estados) e `scope/module-graph.ts` `{nodes:string[],edges:[from,to][]}` — **em memória, sem serialização**. Graphify: `installGraphify` (uv, `graphifyy[mcp]`), `managedMcpReady` só checa `graph.json` existe. **Sem parser de `graph.json`.**
- **Memória: não existe** domínio persistente. Base: `ArtifactStore {write(atômico)/read/exists/recover}`, `ConfigStore {read/write/resolve, scopes gate|project}`. Caminhos: gate=`$GATEWRIGHT_HOME??~/.gatewright/config.json`, projeto=`<cwd>/.gatewright/config.json`, registry=`$GATEWRIGHT_PROJECTS??~/.gatewright/projects.json`. `Journal {read/head/append/verify/project}` hash-encadeado.

## 1. P1 — Skills e ficha de agentes

### DTOs (bridge → renderer)
```ts
// skills.list
type SkillOrigin = "bundled" | "project";
interface SkillSummary { name:string; description:string; category:string; origin:SkillOrigin; dependents:string[] /*agentIds*/; invalid?:boolean }
interface SkillsListResult { skills:SkillSummary[]; categories:string[]; origins:SkillOrigin[]; problems:{dir:string;message:string}[] }
// skills.detail
interface SkillDetail extends SkillSummary { body:string; responsibilities?:string; expectedInput?:string; expectedOutput?:string; boundaries?:string }
```
- `category` = `metadata.category` se presente, senão mapeamento documentado de `skillKind` (`general|sdd|gate|...`). `origin` derivado do root (projeto vence por nome — já é a semântica de `projectSkills`). `dependents` = `projectAgents(cwd).filter(a=>a.skills.includes(name)).map(a=>a.id)`. `invalid` a partir de `catalog.problems()`.
- Filtro `_system/` mantido em todos os caminhos públicos (lista, detalhe, prompts MCP).

### AgentProfile estendido (`agents.ts`)
```ts
const agentSchema = z.object({
  id, name, goal, skills,
  responsibilities: z.string().trim().max(1000).optional(),
  expectedInput:   z.string().trim().max(1000).optional(),
  expectedOutput:  z.string().trim().max(1000).optional(),
  boundaries:      z.string().trim().max(1000).optional(),
  schemaVersion:   z.literal(2).optional(), // ausente = legado v1, aceito
}).strict();
```
- **Migração**: sem reescrita em massa. Perfil sem os campos continua válido (`.optional()`). `schemaVersion` só marca perfis gravados após P1; leitura não exige.
- `composeAgent` passa a anexar, quando presentes, um bloco determinístico (`## Responsabilidades`, `## Entrada esperada`, `## Saída esperada`, `## Limites`) **antes** da lista de skills, dentro do teto de 20 KB. Prévia, execução, Flow e prompt MCP continuam saindo daqui (fonte única). Snapshot do Flow (`agentPrompt` em `FLOW_START`) preserva o texto do início — nada muda nesse ponto.
- Novas operações: `updateAgent(cwd,profile)` (valida via `composeAgent`, exige id **existente**, grava preservando a proteção; não cria duplicata), `deleteAgent(cwd,id)`. Bridge: `agent.update`, `agent.delete`; `agent.preview` invalida o token da prévia se skills/composição mudarem antes de executar.
- IPC: adicionar `agent.update`, `agent.delete` à allowlist de `main.mjs`; `skills.list`/`skills.detail` idem (ou derivar do `snapshot` estendido — decisão: **métodos próprios** para busca sem recarregar snapshot inteiro).

## 2. P2 — Operações de integração e saúde

### Operação persistente (core, novo `src/core/integrations/operations.ts`)
```ts
type StepStatus = "pending"|"running"|"succeeded"|"failed"|"skipped"|"unknown";
interface OperationStep { id:string; label:string; status:StepStatus; errorCode?:string; evidence?:Record<string,string> }
interface IntegrationOperation {
  id:string; cwd:string; revision:string; recipeKind:string;
  status:"pending"|"running"|"succeeded"|"failed"|"partial";
  steps:OperationStep[]; startedAt:string; updatedAt:string;
}
```
- Persistência: journal append-only por operação em `.gatewright/operations/<id>.json` (reusa `Journal`); evento de etapa `OP_STEP{seq,stepId,status,evidence?}`. Snapshot reconstruído por `Journal.project(...)`.
- Evidência por efeito (TRD §Operações): Docker→containerId; npm/Graphify→pasta+versão; MCP→revisão aplicada. Gravar **antes** de repetir etapa.
- Reconciliação: etapa `running` encontrada ao reabrir → verificar recurso próprio (contêiner existe? pasta/venv? revisão MCP?) antes de retomar; marcar `unknown` quando indeterminável e pedir decisão.
- Evento ao renderer: `integration.progress {cwd,operationId,seq,step}`. `seq` monotônico evita retroceder a tela com evento atrasado. Reabrir → `integration.operation.get` devolve snapshot completo.
- Consolidação R2: `customize.propose/apply` do bridge passam a delegar a `proposeIntegration/applyIntegration` (core R2) **preservando** mensagens, guard de projeto, cache por revisão e journal `integrations.json`. Proteger confirmação concorrente da mesma revisão (lock por revisão; confirmação consumida não dispara 2 receitas) — tanto no bridge quanto no cache MCP de `integrate_tool`.

### HealthStatus
```ts
interface HealthStatus {
  configured:boolean; artifactReady:boolean; lastAttemptAt?:string;
  verification:"never"|"checking"|"passed"|"failed"|"unknown";
  latencyMs?:number; checkedRevision?:string; errorCode?:string;
  auth?:"unknown"|"ok"|"failed"; actions:string[];
}
```
- `integration.test` estendido para gravar tentativa/horário/fase/erro/latência; retry **testa o endpoint/subprocesso já configurado** (não reinstala). Evidência expira visualmente quando `checkedRevision` ≠ revisão atual. Latência mede operação explícita (ex.: init MCP); mesma medida para comparar. Cancelamento/timeout testados.

## 3. P3 — Pendências e FDR-007

### Implementação validada em 21/11/2026

A aba Projeto → Pendências consome pending.list, mantém o resumo atual e abre o item por pending.open. A ação reconsulta a projeção e confere kind, entity e revision. Revisões usam o mesmo prepareReview do caminho manual e a decisão permanece vinculada ao diff atual. O diagnóstico leva ao snapshot da operação pelo ID. Respostas de um projeto anterior são descartadas no renderer.

A revisão de um Flow segue o head do journal, mantendo a identidade do FLOW_START. Runs registrados no journal do Flow ficam no fluxo de revisão próprio e não geram uma segunda aprovação avulsa. Uma operação de integração tem revisão derivada de seu estado persistido. A projeção do bridge omite retomadas enquanto houver run ativo. flow.resume recusa uma segunda chamada durante uma execução em andamento.

O smoke desktop/pending-smoke.mjs cobre a janela, IPC e bridge reais, revisão vencida, diagnóstico, janela compacta e reinício do Electron na mesma pasta com uma ask recuperada ou run aguardando confirmação. O script termina esses fluxos antes de limpar a fixture.


### Projeção `pending.list` (core, `src/core/pending/projection.ts`)
```ts
type PendingKind = "review"|"resumable-run"|"resumable-ask"|"integration-failure";
interface PendingItem { kind:PendingKind; entity:string /*runId|operationId*/; revision:string; title:string; action:string; link:{view:string;id:string} }
```
- Derivada de fontes de verdade (não é 2º armazenamento): Flow (`resumableFlow`, `flow-state.json`), runs aguardando review (journal), operações de integração `failed|partial`. Item resolvido some ao mudar a fonte. Contagem segue filtro. Filtrar não altera entidades.

### FDR-007 (fecha o arco Flow durável)
Estado em 21/11: FDR-001..007 ligados à janela, com os ensaios descritos acima. O inventário abaixo registra os pontos resolvidos (ver `../../.specs/features/flow-durable-resume/tasks.md` FDR-007). Trabalho:
1. `flow.resume` na allowlist de `main.mjs`; `Bridge.busy` passa a considerar flow restaurado (fechar/cancelar refletem trabalho real); `inFlow=true` no resume.
2. **Ordem de eventos**: `flow.ask` recuperado é emitido durante `open`, antes de `cwdRef.current` ser setado, e o renderer filtra por `cwd` → evento perdido. Correção: entregar a revisão recuperada **no retorno do `open`** (via `resumableFlow`) e/ou **enfileirar** eventos até a seleção da pasta ser confirmada no renderer; `app.jsx open()` consome `resumableFlow` e seta estado antes de escrever `cwdRef`.
3. UI de retomada: `atKind:"run"` mostra título + "Retomar"(`flow.resume`)/"Encerrar"(`flow.stop`), run só após confirmação; `atKind:"ask", pendingAsk:false` mostra o problema e oferece encerrar.
4. Reconciliar processo ativo × journal ao retomar: crash entre efeito e registro **não** autoriza repetir efeito desconhecido → sinalizar incerteza.
5. Teste e2e: Electron, mesma `cwd` entre reinícios (estende `bridge.resume.test.ts`).

## 4. P4 — Memória e contexto

### Domínio (novo `src/core/memory/`)
```ts
type MemoryType = "decision"|"preference"|"learning";
type MemoryScope = "user"|"project"|"run";
interface MemoryRecord {
  id:string; title:string; body:string; type:MemoryType; scope:MemoryScope;
  projectId?:string; runId?:string; origin:"human"|"ai-suggested";
  recipients?:string[] /*agentIds*/; version:number;
  createdAt:string; updatedAt:string; deletedAt?:string;
}
```
- Persistência: `MemoryStore` sobre `Journal` + `ArtifactStore`. Escopo **user** em `$GATEWRIGHT_HOME/memory/…` (global), **project/run** em `<cwd>/.gatewright/memory/…` com identidade canônica da pasta/run. Gravação atômica + `version` para edição concorrente. Exclusão = evento tombstone (`deletedAt`), remove das consultas futuras sem apagar histórico já gravado.
- **Isolamento**: registro do projeto A nunca entra automaticamente no contexto de B. Memória de usuário oferecida a outro projeto exige escolha explícita. Memória de execução **não** promove para projeto.
- Sugestão de IA (`origin:"ai-suggested"`) exige ação de salvar a versão revisada.
- `memory.resolve(cwd, selection)` → `MemorySnapshot {items:{id,version,text}[], profileVersion?, recipients?}` congelado no preparo do run; compensa orçamento de contexto dentro do limite do runtime (mesma conta de instruções), erro acionável se exceder **antes** de iniciar. Editar/excluir memória ativa não altera snapshot já usado; a UI explica a retenção do texto no journal.
- Contratos: `memory.list/upsert/delete/resolve` (bridge + MCP com os mesmos limites de escopo). Depende de P1 (composição) e P3 (snapshot/revisão da seleção).

## 5. P5 — Mapa de código (Graphify) e diff

### Adapter (novo `src/core/codemap/`)
```ts
interface CodeMapNode { id:string; name:string; kind:string; path:string; meta?:Record<string,unknown> }
interface CodeMapEdge { from:string; to:string; relation:string; origin:string }
interface CodeMap { nodes:CodeMapNode[]; edges:CodeMapEdge[]; parserVersion:string; indexedAt:string; artifactRef:string; truncated?:{limit:number;reason:string} }
```
- Parser de `graphify-out/graph.json` **validado contra exemplo real da versão instalada** (conferir o schema efetivo no ambiente antes de fixar; fixture representativa se o CLI não puder rodar). Normalizar id/nome/tipo/path/relação; registrar `parserVersion`, `indexedAt`, `artifactRef`. Limites de tamanho/tempo/nós **antes** de parsear; grafo grande → carregar vizinhança/página e informar o recorte (`truncated`).
- Última versão válida preservada até nova geração terminar; `projectMap.refresh` usa o mecanismo de progresso da P2 (pode falhar). Grafo inválido mantém a última válida + informa problema.
- Diff: relacionar caminhos **normalizados** (Linux/macOS/Windows, renomes) do diff aos nós; dependentes = consumidores a revisar, com origem da relação. `projectMap.openFile` resolve caminho canônico **dentro** da pasta autorizada e abre via ação explícita do Electron. Lista equivalente ao mapa, navegável por teclado.
- O DAG do Flow e o `ModuleGraph` mantêm seus contratos próprios — conversão explícita só onde necessária.

## 6. P6 — Custos por atribuição

- Gravar no início do run (via `meta` do `CONTROL_STATE_CHANGED` ou header de journal dedicado): `{agentId?, providerId?, integrationIds?:string[], attributionSource:"run-start"|"inferred"}`. Distinguir **uso efetivo** (evento) de **contexto habilitado** (inferido).
- `aggregateUsage` estendido: agrupamentos por `agent|provider|task|integration`, reusando a reconciliação cumulativa existente. DTO de grupo `{knownSumBrl, pricedCount, unpricedCount}`; grupo sem preço → desconhecido. Sem atribuição → bucket "Sem atribuição". **Integração participante não multiplica o custo da execução** — uso é atribuído à execução; repartição, se houver, é regra explícita e verificável. Histórico legado sem atribuição continua válido.
- Período único para gráficos/agrupamentos/métricas/tabela. Selecionar barra/linha filtra IDs e abre execuções; drawer do run mostra fonte do valor + metadados + "Abrir tarefa". Assinatura/cobrança SaaS exigem fonte própria (fora de escopo sem ela).

## 7. P7 — Ajuda, estados, acessibilidade, regressão

- Conteúdo local indexado por `{screenId, action, errorCode}` (ex.: autenticação, gráfico ausente, revisão vencida, custo desconhecido, retomada interrompida). Drawer mantém o formulário atual; Escape fecha; foco contido e retorna ao acionador; links internos preservam o projeto. Ajuda de cada fluxo entregue **na sua fase**; P7 consolida, revisa links/erros, mede janela pequena e teclado, roda build/typecheck/testes/smoke, captura screenshots reais, atualiza README conforme autorização.

## 8. Decisões de design registradas

1. **Campos de ficha e de skill são opcionais + migração aditiva** (sem reescrever perfis); `schemaVersion` só rotula gravações novas. Preserva perfis legados (AG-01).
2. **Fonte única de composição** permanece `composeAgent`; os novos campos entram no mesmo texto, logo prévia==execução==Flow==MCP sem divergência.
3. **Operações de integração em journal por-id** (não em config), para evidência append-only e reconciliação; config guarda só o estado final do módulo.
4. **Revisão humana headless = confirmação explícita em 2 passos** (já no R2: `integrate_tool` propor→`confirm`); P2 adiciona lock por revisão contra confirmação concorrente.
5. **Memória por escopo com tombstone**, não patch de config; snapshot imutável por run.
6. **CodeMap é domínio próprio** (não reusa Execution/Module graph); valida schema real do Graphify antes de fixar o parser.
7. **Atribuição de custo gravada no início do run**; nunca dupla contagem por integração; "Sem atribuição" para legado/desconhecido.
8. **Métodos de bridge próprios** para listas pesquisáveis (skills/memory/pending/map) em vez de inflar o `snapshot`, evitando recarregar tudo a cada filtro.
