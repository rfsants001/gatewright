# Codex com escrita governada — entrega e retomada

Atualizado em 21/11/2026, sobre main `537470f`. Preservados os commits do Claude `1f7792c` (pacotes) e `537470f` (dogfooding). Código e ícones publicados em `3006b4d`; consulte o log para atualizações posteriores de evidência. Documentação canônica em docs; .specs/vault fora dos commits, sem Co-authored-by.

## Produto e aceite

O Codex disponível no desktop deixa de ser somente leitura. A pessoa pode selecionar um agente e memórias, executar uma tarefa de código, acompanhar comandos e resultados, cancelar, revisar o diff e usar o Flow SDD. O caminho reutiliza o runtime existente. Login, assinatura, modelo e provedor continuam sendo os configurados na CLI nativa.

Antes de executar: aplicar a configuração em Integrações, abrir `codex` na mesma pasta, revisar confiança do projeto e os quatro hooks em `/hooks`, depois clicar em **Verificar hooks** no app. O Gatewright não grava a confiança em nome da pessoa. Mudanças nos comandos exigem nova revisão nativa. A verificação é repetida a cada execução; configuração presente não equivale a hooks confiáveis.

Critérios entregues:

- Escrita no workspace, comandos/testes e MCP Gatewright obrigatório; nenhum modo de acesso irrestrito ou bypass de confiança.
- Falha antes de editar quando a configuração ou confiança dos hooks está ausente/modificada.
- Instruções compostas e snapshot do contexto preservados no run e no Flow.
- Eventos JSONL úteis de comando, resultado, edição e MCP; erros nativos visíveis.
- Cancelamento encerra processos pertencentes ao worker e seus descendentes.
- Entrada em cache contada uma única vez; fallback para o modelo escolhido quando o evento nativo não inclui modelo. Custo sem preço permanece desconhecido.
- Logo G grafite/rosa no ícone da janela, Linux, Windows e macOS; atalho Linux instala os tamanhos no tema do usuário.

## Contratos técnicos / SDD complementar

| Caminho | Contrato |
| --- | --- |
| `src/app/codex.ts` | Worker `gate codex-run`; consulta JSON-RPC `initialize` → `hooks/list` no app-server nativo antes de executar. Timeout de 12 s e limite de 2 MB. Exige hooks preToolUse/postToolUse/stop/subagentStop habilitados, comando exato, origem no `.codex/config.toml` do projeto e trustStatus trusted/managed. |
| `src/core/engine/codex-command.ts` | `codex exec --json --cd <projeto> --sandbox workspace-write`, approval_policy=never, rede de comandos desabilitada e writable_roots adicionais vazias. Prompt após `--`; modelo separado. Injeta MCPs gerenciados por invocação, Gatewright required=true. |
| `src/core/engine/codex-executable.ts` | Binário no PATH em POSIX; Windows reconhece codex.exe e o script npm oficial executado sem shell cmd intermediário. |
| `src/host/codex.ts` | Normaliza shell/exec_command e apply_patch nativos para o harness compartilhado, incluindo todos os arquivos e renomes do patch. |
| `src/desktop/bridge.ts` / `desktop/main.mjs` | `terminal.test({cwd,host:"codex"})` retorna ready/configured/missing/message. Renderer descarta respostas de outro projeto e apresenta ação Verificar hooks. |
| `stream-host.ts` / `usage.ts` | tokensIn = input_tokens − cached_input_tokens; cacheRead separado e cumulativo. RUN_CONTEXT fornece modelo ausente. |
| `gate-bin.ts` / `terminal.ts` | Hooks/MCPs gerados pelo app empacotado propagam ELECTRON_RUN_AS_NODE=1. OpenCode propaga o ambiente no plugin e no MCP local; Claude/Gemini/Codex o recebem nos formatos correspondentes. |
| `electron-builder.yml` | Runtime inclui dist, skills e scripts/jev. Linux usa identidade io.gatewright.Desktop; Windows ICO e macOS ICNS. Fontes e regeneração em build/README.md. |

Somente ferramentas de consulta Gatewright (`list_gates`, `check_gate`, `get_jev_config`, `memory_list`, `memory_resolve`) recebem approval_mode=approve para uso sem interação. Ferramentas que alteram configuração conservam a aprovação nativa; não podem instalar algo silenciosamente dentro de uma tarefa. As instalações revisadas continuam disponíveis no fluxo próprio de Integrações.

O worker remove somente variáveis de sessão/IPC do Codex pai para iniciar uma sessão independente. Preserva credenciais, CODEX_HOME e CODEX_PERMISSION_PROFILE. Não altera controles herdados para fazer um teste passar.

## Evidência de 21/11

Ambiente: Linux/Nobara, Node 24.16.0, Electron 45.3.1; protocolo real Codex 0.169.1. Versões sem hooks/list recebem orientação de atualização, em vez de executar sem comprovação dos hooks.

- CI confirmou abertura em Linux/macOS/Windows e fluxos Electron no Linux. O teste de retomada agora aceita a falha imediata de um host ausente e exige exatamente um flow.run, eliminando a dependência de temporização da mensagem de rejeição.
- `npm run check`: **974 testes / 130 arquivos** com GATEWRIGHT_HOME e GATEWRIGHT_PROJECTS temporários. O registro pessoal não deve ser usado pelo bridge durante a suíte.
- Smokes Electron de abertura, Pendências e evolução: projeto descartável, IPC e bridge reais. A extensão Codex usa uma CLI controlada e MCP Gatewright real: confiança pendente, edição, comando de teste, revisão aprovada, tokens/cache/modelo, Flow e cancelamento. Fixtures em `desktop/codex-fixture.mjs`; não são importadas pela produção.
- CLI Codex real, sem credenciais reais e com CODEX_HOME isolado, backend HTTP local com respostas fixas: MCP carregado, ferramenta check_gate executada e leitura de `.env` bloqueada pelo hook nativo. A revisão dos hooks ocorreu pelo fluxo interativo nativo, somente no projeto descartável.
- **Limite do ensaio nativo:** comandos de edição/teste retornaram `error building bubblewrap command: app-server socket directory must be a user-owned directory with mode 0700` neste ambiente. Nenhum bypass foi aplicado. Portanto, escrita autenticada com modelo real continua pendente do piloto; o sucesso da CLI controlada não comprova esse aceite.
- `npm run dist:linux`: AppImage e `.deb` reconstruídos com logo atual. O `.deb` contém a entrada io.gatewright.Desktop.desktop e ícones hicolor 16–512. Atalho Linux testado em XDG temporário e atualizado para o usuário.
- Janela do executável Linux empacotado abriu em perfil descartável: preload, IPC, bridge, abertura de projeto e snapshot funcionaram.
- Runtime Linux empacotado iniciado como Node fora da janela: handshake MCP com **11 ferramentas e 31 prompts de skills**. PNG 1024, ICO com sete resoluções e ICNS foram decodificados; isso não substitui aceite de instaladores no Windows/macOS.

Para repetir a suíte sem tocar no registro pessoal, crie um diretório temporário e defina GATEWRIGHT_HOME e GATEWRIGHT_PROJECTS apontando para ele antes de `npm run check`. Os smokes desktop já criam seus próprios perfis descartáveis.

## Limites e próxima ação do Claude

1. Acompanhar o piloto Linux: login nativo, confiança, tarefa pequena com arquivo e teste, gates, revisão, cancelamento, retomada e tokens. Usar docs/dogfooding sem registrar credenciais. Um erro de ambiente não autoriza desligar o sandbox.
2. Conferir CI e os builds nativos quando houver ambiente Windows/macOS. RPM local Nobara/RPM 6 ainda falha com fpm 1.9; o workflow de tag usa Ubuntu/RPM 4. Não foi criada uma tag nesta continuação.
3. Para MCP/hooks externos com a janela fechada, usar instalação permanente ou checkout estável. O AppImage monta o runtime em caminho temporário e a configuração pode ficar inválida após fechar. A persistência dos caminhos do AppImage exige uma entrega específica.
4. Não reimplementar P0–P7 nem substituir o empacotamento do Claude. Falta tool calling no adapter HTTP direto, coleta integral de telemetria de sessões externas, preços/conversão configuráveis, assinatura e atualização automática. Essas frentes continuam separadas da paridade Codex.

Referências primárias do protocolo/política: [execução sem interação](https://learn.chatgpt.com/docs/non-interactive-mode), [hooks e confiança](https://learn.chatgpt.com/docs/hooks), [configuração](https://learn.chatgpt.com/docs/config-file/config-reference) e [MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). O contrato também foi confrontado com o schema gerado pela CLI 0.169.1 instalada.
