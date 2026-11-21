# Gatewright — TRD da evolução do desktop

> Continuação de 21/11: P0–P7 e P2-004b estão concluídas. Codex com escrita governada, empacotamento e ícones atuais foram acrescentados depois. Leia [o adendo Codex](CODEX-PARITY.md) e o checkpoint antes de retomar; o texto de planejamento abaixo preserva a referência das fases originais.

Referência técnica para o SDD. A inspeção foi feita em 20/11/2026 sobre `b2dfd32`. Confira o checkpoint e as assinaturas atuais antes de qualquer continuação. As estruturas abaixo são propostas a refinar, e cada alteração precisa preservar dados e chamadores existentes.

## Entrega integrada em 21/11/2026

P0–P7 e P2-004b implementadas no aplicativo. A validação atual está em [CHECKPOINT.md](CHECKPOINT.md) e [no registro do Electron](screens/validation-2026-11-21/README.md). O material em `ui/` continua sendo uma referência isolada com fixtures; as telas de produção estão em `desktop/renderer/`.

A entrega inclui memória com versões e seleção explícita, snapshot imutável de contexto, histórico de tarefas com ou sem medição, mapa Graphify com arquivo/diff, custos por atribuição, recuperação de recursos pertencentes à operação e ajuda por tela/ação/erro. A validação autenticada de serviços de terceiros e dos hosts em cada sistema operacional permanece uma matriz de ambiente, sem promessa de compatibilidade universal.

## Contratos entregues

- `memory.list/upsert/delete/resolve`: domínio compartilhado `src/core/memory/store.ts`. MCP: `memory_list`, `memory_upsert`, `memory_delete`, `memory_resolve`. Cada versão é um evento do Journal em `<base>/memory/<scope>/<id>/vNNNNNN.json`, publicado por hard link exclusivo de um artefato já sincronizado. Isso implementa compare-and-swap entre processos, sem lock abandonado. `schemaVersion:1`; versão futura é rejeitada; exclusão é tombstone. User: `$GATEWRIGHT_HOME` ou `~/.gatewright`. Projeto/tarefa: `<cwd>/.gatewright`. Não existe formato anterior a migrar.
- `run/flow.start` aceitam `memories:[{id,scope,version}]`. `RUN_CONTEXT` registra objetivo, engine, modelo, instruções, atribuição e `memorySnapshot` antes de iniciar o processo. `FLOW_START.runContext` preserva o mesmo snapshot nos reinícios. Agente + memória têm teto conjunto de 20.000 bytes UTF-8. Destinatários e escopo são verificados antes de executar.
- `run.list` e `run.detail`: histórico íntegro, inclusive sem evento de uso. O detalhe limita os eventos apresentados aos 300 finais, mantendo o header de contexto original.
- `projectMap.get/refresh/openFile`: adapter em `src/core/codemap/map.ts`, separado do DAG de execução. Aceita `nodes` com `links` ou `edges`, formatos legado e schema 1; não aceita schema futuro. Limites de 20 MB, 4.000 nós, 12.000 relações; mapa desenha 160 resultados por busca e lista acessa todos. Cache da última versão válida, mtime, revisão SHA-256, versão quando fornecida e ligação com Git, inclusive renomes. Abertura canônica recusa escape/symlink externo e arquivos binários; diff sem filtros externos. Electron localiza o arquivo somente após validação pelo bridge.
- Graphify 0.9.114 foi instalado e executado de verdade em `/tmp`, sem autenticação nem alteração do ambiente do usuário. Geração: `python -m graphify extract . --code-only --no-cluster --out .`. O pacote efetivamente publicou `edges` sem metadata de versão; a fixture real está em `src/core/codemap/fixtures/`. O adapter também cobre schema 1 documentado no upstream.
- `usage.get({days:7|30})`: período aplicado depois da reconciliação cumulativa e antes de todos os agrupamentos. `byAttribution` contém agent/provider/task/integration, `knownSumBrl`, `pricedCount`, `unpricedCount`, tokens e runIds. Legado fica sem atribuição; custo sem preço continua indefinido. Integrações significam contexto habilitado: divisão igual do valor da tarefa entre IDs únicos, sem afirmar custo do SaaS ou uso observado de ferramenta.
- `applyIntegration` é a implementação única do desktop/MCP, com mutex de projeto compartilhado também pela recuperação. Reporters dos instaladores registram cada comando, caminho/ownership, versão e container ID. Diretórios recebem marca da operação; contêineres, etiqueta `gatewright.operation`. O journal de operação guarda a receita aprovada. Falha no registro final após commit da instalação retorna aviso sem pedir reinstalação.
- `integration.operation.inspect/recover`: consulta artefatos, versão, registro e propriedade reais. A ação exige revisão atual, instalador inativo e prova de propriedade para remover. Cleanup remove apenas o recurso e vínculos correspondentes e termina em `reverted`, saindo das pendências. Operação antiga sem receita/ownership não é removida automaticamente. MCP equivalente: `integration_operation` com list/inspect/reconcile/cleanup. Nenhum desses caminhos repete comandos de instalação durante a reconciliação.
- Ajuda em `desktop/renderer/help.jsx`: dialog nativo modal, foco contido, Escape, retorno ao acionador, conteúdo por tela/ação/erro. Formulários e projeto permanecem montados ao abrir a ajuda.

## Pontos de integração encontrados

| Área | Arquivos existentes | Uso esperado |
| --- | --- | --- |
| Electron | desktop/main.mjs, desktop/preload.cjs | Lista de IPC permitida, eventos e ciclo da janela |
| Interface | desktop/renderer/app.jsx, library.jsx, usage.jsx, theme.css | Reaproveitar shell, tema, biblioteca, compositor e gráficos |
| Ponte | src/desktop/bridge.ts | Escopo da pasta, chamadas, snapshot, eventos e proteção do trabalho ativo |
| Skills | src/core/skills/catalog.ts, skill-doc.ts, types.ts, agents.ts | Parser, corpo, origem derivada, composição e dependentes |
| Config | src/core/config/config-store.ts | Configuração por projeto e merge existente |
| Integrações | src/core/integrations/configure.ts, modules.ts, managed-mcp.ts | Proposta e aplicação compartilhadas, módulos e registro MCP |
| Instaladores | src/app/customize.ts, integration-install.ts, integration-diagnostics.ts | Receitas concretas e handshake |
| MCP | src/mcp/server.ts, prompts.ts, resources.ts | Ferramentas R2, prompts e recursos |
| Flow | src/core/flow/flow-journal.ts, flow.ts, src/desktop/bridge.resume.test.ts | Replay, snapshot e retomada |
| Custos | src/core/run/usage.ts, pricing.ts, src/core/engine/run-journal.ts | Agregação e fonte dos eventos |
| Grafos | src/core/graph/execution-graph.ts, src/core/scope/module-graph.ts | Consultar contratos existentes ao definir a representação do mapa de código |

O protótipo está em `ui/`. Seu build gera uma aplicação de demonstração isolada com fixtures. Seus callbacks mostram o comportamento da interação. A produção deve receber os dados reais por contratos do domínio e pelo bridge.

## Camadas e responsabilidade

Renderer recebe DTOs, deriva filtros e emite ações. Electron valida remetente e operações permitidas. Bridge valida entradas, projeto ativo e revisões e encaminha ao domínio. Domínio mantém armazenamento, receitas, journals, diagnósticos e composição. Clientes MCP consomem as mesmas operações e as aprovações do caminho correspondente.

Atualizar as listas IPC, schemas, preload e tratamento de evento em conjunto. O SDD deve criar uma matriz com a chamada, a ação da tela, o DTO, a camada de execução e o teste. Dados de demonstração ficam no material de design ou nas fixtures de teste.

## Skills e agentes

Ampliar o DTO de skill com nome, descrição, skillKind/categoria, origem, referências de agentes e revisão do conteúdo. Identidade continua pelo nome canônico, usando a precedência atual de projeto sobre o catálogo distribuído. Derivar dependentes a partir dos perfis existentes. Filtrar `_system/` em todos os caminhos públicos.

Ampliar AgentProfile com campos opcionais `responsibilities`, `expectedInput`, `expectedOutput`, `boundaries` e uma versão de schema quando a estratégia de migração exigir. Hoje o schema Zod é strict. Portanto, atualize schema, tipos e leitores ao adicionar os campos. A ausência dos campos mantém o comportamento de perfis legados.

A composição deve ocorrer em `composeAgent` ou em uma extensão compatível dessa função. Prévia, prompt MCP, execução direta e Flow passam por essa fonte. O snapshot de Flow já guarda agentPrompt e deve continuar a preservar o texto do início. A troca de agente na tarefa muda a proposta de instruções para a próxima execução. Preservar validação de skills existentes, ordem, duplicatas e limite de 20 KB até que uma mudança desse limite seja validada nos hosts suportados.

Salvar reordenação requer uma operação de atualização e revisão do perfil. A função atual de criação recusa IDs duplicados. O SDD precisa prever atualização sem contornar essa proteção. Se alterar skills ou composição durante uma prévia, invalidar o token daquela prévia antes de executar.

## Operações de integração

O core do R2 contém proposeIntegration/applyIntegration. O bridge ainda possui sua própria construção de proposta e journal. Consolidar o comportamento observável antes de remover duplicação, preservando mensagens, proteção de projeto e registros existentes.

Introduzir uma operação persistente com ID, projeto, revisão da proposta, receita, estado global, etapas e datas. Proposta de etapas `pending`, `running`, `succeeded`, `failed`, `skipped`, `unknown`. Uma etapa `running` encontrada depois de reiniciar requer reconciliação, porque o comando pode ter produzido efeitos antes da falha do processo.

A operação pode emitir eventos como `integration.progress` com `cwd`, `operationId`, sequência e etapa. Definir uma única convenção no SDD e usar a mesma no bridge e renderer. A sequência evita retroceder a tela quando um evento atrasado chega depois de um snapshot mais recente. Ao reabrir, um snapshot completo reconstrói a operação. Logs devem resumir erros e preservar referência à evidência sem expor chaves.

Persistir evidência de cada efeito relevante. Para Docker guardar o ID do contêiner criado. Para npm e Graphify guardar a pasta própria e a versão instalada. Para registro MCP guardar a revisão aplicada. Compartilhar um executor que receba diretório e argumentos e permita progresso real. Falha de journal depois de um efeito aplicado precisa retornar o estado aplicado com registro incompleto, em vez de incentivar uma repetição cega.

Proposta e aplicação devem proteger chamadas simultâneas e garantir que uma confirmação consumida não dispare duas receitas. Rever o cache por revisão do MCP e a ausência de exclusão mútua em chamadas concorrentes. Uma aprovação exibida em cliente MCP depende de ação explícita da pessoa no cliente, já que a chamada de confirmação por si só é invocável pelo agente.

Retentar o diagnóstico apenas testa o endpoint ou subprocesso já configurado. Continuar instalação primeiro verifica recurso próprio, existência e estado. Desinstalação precisa de plano do que será removido e de comportamento em falhas parciais. Entradas acrescentadas em configurações dos hosts precisam de pertencimento e revisão para remoção segura.

### Saúde

DTO proposto com `configured`, `artifactReady`, `lastAttemptAt`, `verification`, `latencyMs`, `checkedRevision`, `errorCode` e ações disponíveis. `verification` pode ser `never`, `checking`, `passed`, `failed` ou `unknown`. A autenticação tem resultado separado quando observada no host. Evidência expira visualmente quando configuração ou versão do artefato muda.

A latência mede uma operação explicitada, por exemplo inicialização MCP. Comparações devem usar a mesma medida. Falhas de transporte encerram o cliente e processo de diagnóstico quando pertencentes à operação. Cancelamento e timeout precisam ser testados.

## Pendências e FDR-007

Criar uma projeção de leitura que combine Flow, execuções e operações de integração. Identidade de pendência inclui o tipo, a entidade e a revisão, para a ação usar a versão correta. Um item resolvido deixa de aparecer por mudança da fonte de verdade.

FDR-007 tem uma dependência concreta de ordem dos eventos. O bridge pode emitir flow.ask durante open antes de o renderer atualizar cwdRef. Definir entrega da revisão recuperada em snapshot ou enfileirar eventos até a seleção da pasta ser confirmada. Adicionar flow.resume à allowlist quando o fluxo de tela estiver conectado. A guarda busy do processo main também deve considerar trabalho restaurado e comandos de retomada.

Ao retomar, reconciliar processo ativo e journal. Um crash depois de concluir um comando e antes de registrar seu resultado não autoriza repetir um efeito desconhecido. A fase deve especificar como sinalizar incerteza e pedir uma decisão sobre o estado observável.

## Memória

Implementar um domínio dedicado usando as abstrações de ArtifactStore existentes. Proposta de registro versionado com ID, título, corpo, tipo, escopo, projectId/runId quando aplicável, origem, destinatários e timestamps. Fazer migrações explícitas e usar gravação atômica e revisão para edição concorrente.

Escopo de usuário usa o diretório do Gatewright resolvido pela configuração de ambiente. Projeto e execução têm identidade canônica associada à pasta e run. Escolher o esquema de arquivos no SDD e expor esse caminho na ajuda de privacidade quando necessário. Memória de execução não é promovida automaticamente ao projeto. Importação de sugestões do modelo exige salvar a versão revisada.

Preparação de run resolve memórias selecionadas e gera snapshot com IDs, versões e texto. Registrar também a versão da composição do perfil e os destinatários. Compensar o tamanho do contexto dentro do limite do runtime, fornecendo mensagem acionável se o orçamento for excedido. Modificar memória ativa não altera um snapshot já usado.

Excluir da biblioteca remove o registro das consultas futuras. O histórico da execução já pode conter seu texto. O SDD deve definir a retenção do conteúdo de contexto e explicar a diferença entre excluir uma referência ativa e limpar um histórico. Reutilizar a política efetiva do projeto quando ela já existir. Queries de cliente MCP e desktop têm os mesmos limites de escopo.

## Mapa e Graphify

O DAG de execução controla trabalho e dependências de etapas. O mapa de código representa módulos e arquivos extraídos do projeto. Mapear cada conceito a um contrato próprio e usar conversão explícita apenas onde necessária.

Criar um adapter para a versão de graphify-out/graph.json efetivamente suportada. Validar schema com exemplos reais da versão instalada. Normalizar ID, nome, tipo, caminho de origem, relação e metadados. Registrar versão do parser, horário de indexação e referência do artefato. Definir limites de tamanho, tempo e quantidade de nós antes de parsear. Para grafos grandes, carregar uma vizinhança ou página e informar esse recorte.

Manter a última versão válida até uma nova geração terminar. Gerar o grafo é uma operação que pode falhar e deve usar o mecanismo de progresso. O contrato exato do CLI Graphify deve ser verificado na versão usada na implementação. O mapa da prévia é dado sintético, que demonstra navegação e estados.

Relacionar caminhos normalizados do diff aos arquivos do grafo com tratamento de renomes. Resolver caminhos dentro da pasta autorizada, incluindo links e variantes de path no Windows. Abrir arquivo via ação explícita do Electron e destino permitido. A UI apresenta relações observadas e impacto possível para teste.

## Custos

Estender o metadata do início da execução com IDs e versões de agente, provedor, integrações efetivamente disponíveis ou usadas e origem dessa atribuição. Identificar no SDD o que pode ser inferido de contexto habilitado e o que é evento de uso efetivo. Custo de uma tarefa não deve ser contado integralmente uma vez para cada integração participante. Oferecer Sem atribuição ou uma regra de repartição explícita e verificável.

Reusar aggregateUsage e a reconciliação de eventos cumulativos. Preservar preço reportado, estimativa e ausência. DTOs de agrupamento devem conter soma conhecida, quantidade com preço e quantidade sem preço. Grupo totalmente sem preço retorna valor desconhecido. Registros históricos continuam válidos mesmo sem agente ou provedor atribuídos.

O período precisa ser o mesmo para gráficos, agrupamentos, métricas e tabela. Selecionar barra ou linha altera um filtro de IDs e abre as execuções de origem. Um drawer mostra o run, modelo, fonte de valor e metadados de atribuição. Custos de assinatura e cobrança de SaaS dependem de fonte adicional quando integrados.

## Ajuda

Conteúdo local por ID de tela, ação e código de erro. Renderer abre um drawer que mantém o formulário atual. Escape fecha, foco é contido e retorna ao acionador. Links internos levam à ação associada e conservam o projeto. Conteúdo deve ser atualizado na mesma fase do comportamento correspondente.

## Contratos a fechar no SDD

Para cada fase, definir schemas Zod, DTOs, caminhos persistidos, versões, revisões e eventos. A matriz deve cobrir snapshot e ação de ponta a ponta. Nomes possíveis incluem skills.list/detail, agents.update, integrations.operations/get/retry, pending.list, memory.list/upsert/delete/resolve e projectMap.get/refresh. São intenções de contrato para o SDD, e sua nomenclatura pode ser alinhada aos métodos existentes.

## Verificação

Testes novos devem cobrir regressões específicas. Incluir perfil legado, precedência de catálogo, revisão obsoleta, projeto trocado durante resposta, confirmação simultânea, crash entre efeitos e journal, memória de outro projeto, snapshot imutável, arquivo de grafo inválido, custo desconhecido e dupla contagem de integrações. Fazer teste visual com projeto descartável e usar fixtures para falhas controladas. O aceite de host real deve registrar versões e capacidades observadas.

A base passou em 849 testes em 20/11 usando GATEWRIGHT_PROJECTS num diretório temporário. Executar os checks necessários na versão atual. Os exemplos de execução e retomada estão em PHASES.md e CLAUDE-PROMPT.md.
