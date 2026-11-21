# Checkpoint da implementação

Atualizado em 21/11/2026 pelo Codex, a partir de main `1ac6388` (P3 concluída). A entrega `feat(desktop): deliver memory, code maps, costs and recovery` conclui P2-004b e P4–P7. Conferir git status/log para identificar o commit desta entrega e qualquer trabalho posterior antes de editar.

## Estado atual

P0–P7 e P2-004b implementadas. O aplicativo tem seis áreas principais; Projeto oferece Resumo, Pendências, Memória e Mapa. Os documentos deste pacote constituem a referência de retomada. A prévia em ui/ usa fixtures e permanece separada da produção.

| Área | Entrega | Evidência |
| --- | --- | --- |
| Memória | CRUD versionado, user/project/run, opt-in pessoal, destinatários, tombstone, Journal e publicação CAS entre processos | core/memory/store.test.ts: isolamento A/B, versões, exclusão, UTF-8 e quatro processos concorrentes |
| Contexto | Agente + memórias até 20 KB; RUN_CONTEXT antes de iniciar; FLOW_START preserva snapshot nos reinícios | Smoke Electron envia skill + memória a um servidor HTTP local e conserva v1 após editar para v2 e reiniciar |
| Histórico | run.list/detail; contexto e resultado acessíveis mesmo sem evento de custo | Tela Tarefas e drawer com memórias/instruções originais |
| Mapa | Adapter Graphify legado/schema 1; limites; cache válido; busca; mapa/lista; seleção/relações; arquivo/diff e caminhos canônicos | Fixture real 0.9.114; testes de schema, tamanho, Windows, symlink, Git/rename; geração real e UI Electron |
| Custos | Metadados no início; cumulativo reconciliado; um período para toda a análise; grupos agent/provider/task/integration; origem e desconhecido distintos de zero | attribution.test.ts + usage.test.ts e gráfico → contexto → tarefa na janela |
| Instalação | Proposta/aplicação únicas no core; etapas reais, receita persistida, ownership, versão e containerId; mutex compartilhado | configure/recovery/customize tests; Graphify instalado, conferido e removido de verdade em pasta temporária |
| Recuperação | Inspeção e revisão atual; nunca reinstala ao reconciliar; remoção só de recurso pertencente; reverted sai das pendências | recovery.test.ts e fluxo completo de remoção no Electron |
| Ajuda/estados | Dialog nativo, foco contido, Escape e retorno; ajuda por tela/ação/erro; descarte de respostas de projeto desmontado; scroll | Electron 1440×960, 1120×860 e 780×580 |

## Validação

- Node 24.16.0, Electron 45.3.1, Linux com sessão gráfica.
- `npm run check` com GATEWRIGHT_PROJECTS e GATEWRIGHT_HOME temporários passou em **961 testes / 127 arquivos**, incluindo geração/supersessão do mapa. Comandos em screens/validation-2026-11-21/README.md.
- `npm run test:desktop`, `npm run test:desktop:pending` e `npm run test:desktop:evolution`.
- Graphify 0.9.114: ambiente Python temporário, instalação via applyIntegration, verificação via inspectOperation e cleanup via recoverOperation. Geração real via generateCodeMap, com `extract . --code-only --no-cluster --out .`.
- Correções descobertas pelos ensaios reais: `uv venv --allow-existing` para preservar o marcador de ownership; `--out .` para evitar graphify-out/graphify-out; estado do projeto no rodapé; histórico sem dependência de medição; operação compensada não continua pendente.
- Capturas reais: screens/validation-2026-11-21/evolution/. Banners atuais do README em docs/screenshots/ usam essas capturas com dados declarados de teste.

## Limites explícitos de validação

O provedor HTTP do ensaio é local e controlado; valida spawn, protocolo, contexto e retorno sem cobrar tokens de uma conta real. O Graphify de código foi executado de verdade, sem LLM. Docker/serviços remotos e assinaturas autenticadas de Claude/Codex/Gemini/OpenCode não foram exercitados com as credenciais do usuário nesta entrega. A matriz de inicialização Linux/macOS/Windows está no CI; os fluxos novos foram ensaiados localmente no Linux. Isso não equivale a suporte universal a qualquer proxy, SaaS ou versão de CLI.

Operações anteriores sem receita e prova de ownership não permitem remoção automática. Um lock sem owner.json (falha antes do primeiro registro de processo) exige conferência manual, preservando recursos. A geração local indexa código; indexação semântica de documentos depende dos recursos próprios do Graphify. Memórias de tarefa ficam restritas à execução indicada; não são promovidas automaticamente para novos runs. Integrações no custo significam contexto habilitado rateado, não uma fatura externa nem medição de tool calls.

## Lacunas funcionais além do pacote P0–P7

O fechamento das fases deste pacote não encerra toda a visão do produto. A leitura do código após os smokes confirmou:

1. `src/app/providers.ts` ainda faz completação textual em API/proxy direto, sem ciclo de tool calling/MCP. `src/core/engine/adapters/stream-host.ts` inicia Codex com sandbox read-only.
2. Sessões iniciadas fora do aplicativo ainda dependem de coleta de telemetria para aparecer integralmente nos custos.
3. `src/core/run/pricing.ts` tem tabela embutida para famílias Claude e conversão BRL local fixa; preços extensíveis para outros modelos/proxies e atualização da conversão não foram entregues nesta fase.
4. Falta aceite autenticado nos hosts/serviços reais, inclusive prova de bloqueio no OpenCode e operação MCP/harness com a janela fechada. O smoke controlado não substitui esse ensaio.
5. Instaladores nativos com runtime empacotado, assinatura e atualização precisam de entrega própria; hoje a execução depende de Node/checkout e o instalador existente é um atalho Linux.
6. CI validou inicialização nos três SOs; a matriz funcional completa nova foi exercitada no Linux.

## Próxima ação exata para o Claude

Conferir git status, commits posteriores e o CI da entrega a6ab1bf. Não reimplementar P4–P7. Para a visão completa, priorizar em nova continuação autorizada a execução com ferramentas nos caminhos API/proxy e a política de escrita do Codex; em seguida telemetria/preços e distribuição. Executar a matriz autenticada quando houver ambiente disponível. Cada frente precisa de critérios próprios e evidência real, preservando snapshots, versões, orçamento e ownership.

Commits na main, sem Co-authored-by. Não incluir .specs nem a vault. As referências locais podem apontar para este arquivo.
