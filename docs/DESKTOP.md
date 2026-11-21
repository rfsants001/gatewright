# Gatewright Desktop

Gatewright é um painel local para projetos que usam agentes de código. A janela usa Electron e React, com tema escuro por padrão. O runtime continua em TypeScript/Node e é compartilhado com o terminal.

## Executar

Use Linux, macOS ou Windows com sessão gráfica, Node 22.12 ou superior e Git. A primeira abertura pode baixar o binário oficial do Electron. Instale e autentique os hosts que pretende usar.

```sh
npm ci
npm run desktop:dev -- /caminho/do/projeto
```

O caminho do projeto é opcional. Coloque-o entre aspas se contiver espaços, como em `npm run desktop:dev -- "C:/Meus Projetos/app"`. Depois do build, `npm run desktop` abre a janela diretamente. No Linux, o Electron usa namespaces de usuário ou o helper de sandbox configurado pelo sistema.

No Linux, rode `npm run desktop:install` para criar a entrada no menu. O atalho usa o checkout e o Node existentes. Se mover o checkout ou trocar o caminho do Node, reinstale o atalho e reaplique as conexões dos hosts. Com `gate` instalado no PATH, use `gate desktop` para abrir a janela e `gate dashboard` para usar a interface de terminal.

## Usar

- **Projeto** abre uma pasta, mostra projetos recentes e detecta hosts. A prévia da conexão informa os arquivos que serão atualizados. Em **Pendências**, consulte aprovações, retomadas de Flow e falhas de instalação. Cada ação abre a revisão do run correspondente ou o diagnóstico da operação, conferindo a revisão atual da pendência.
- **Tarefas** executa um objetivo, transmite os eventos e permite cancelar. O Flow SDD guia planejamento, aprovação, implementação e revisão. Ao reabrir o projeto, uma revisão pendente é recuperada e uma etapa interrompida aguarda a ação **Retomar**. A aprovação do diff registra a decisão vinculada ao snapshot atual.
- **Custos** exibe o uso registrado nos journals do projeto, com custo por dia, por modelo e tokens por execução. Valores ausentes ou parciais são sinalizados. Hosts abertos por fora precisam de uma fonte de telemetria para que seu consumo apareça aqui.
- **Skills** oferece busca, filtros de categoria e origem, corpo de instruções e os agentes dependentes. Crie playbooks no projeto em formato SKILL.md.
- **Agentes** mantém perfis com responsabilidades, entrada, saída e limites opcionais. Ordene as skills, confira as instruções combinadas e use o perfil numa tarefa. O mesmo compositor alimenta os prompts MCP.
- **Integrações** cadastra provedores de API ou proxy e recebe pedidos em linguagem natural. A pessoa revisa a proposta antes de aplicar as receitas de MCP, npm, Docker, Git, Graphify ou Jev. Operações e resultados de diagnóstico são persistidos. O progresso fino dos instaladores e a compensação de recursos ainda estão em P2-004b. O campo de credencial recebe o nome de uma variável de ambiente disponível ao desktop.

## Compatibilidade do piloto

| Origem | Execução do desktop | Terminal |
| --- | --- | --- |
| Claude Code | Adapter do binário. Autenticação nativa ou credenciais de API conforme a configuração do usuário e do fornecedor. | MCP e hooks do registro padrão em eventos cobertos. |
| Codex | Adapter do binário, com sandbox somente leitura para o piloto. | MCP e configuração inline de hooks. O Codex pode exigir confiança no repo e nos hooks. |
| Gemini CLI | Adapter de JSONL. | MCP e tradução dos hooks de ferramenta e fim de turno. |
| OpenCode | Adapter de JSONL. | Registro MCP em `opencode.json` **mais** um plugin gerenciado (`.opencode/plugin/gatewright.js`) que encaminha eventos de ferramenta ao `gate hook opencode`. OpenCode não expõe hooks por comando; o plugin bloqueia via `throw`. Capacidade entregue (API v1 `@opencode-ai/plugin` 1.19.x); **verificar o bloqueio dentro do host continua em aberto**. |
| Ollama | Endpoint local compatível com OpenAI. Informe um modelo já instalado. | Um host como OpenCode pode usar o modelo e carregar o MCP. |
| API ou proxy externo | Endpoint compatível com OpenAI, com chave referenciada por ambiente quando necessária. | Configurado no host externo. A execução direta do Gatewright é textual. |

Use login e assinaturas pelas opções oficiais dos hosts. O Gatewright não lê nem repassa tokens OAuth da assinatura. [Claude Code](https://code.claude.com/docs/en/legal-and-compliance) · [Codex MCP](https://developers.openai.com/codex/mcp) · [Gemini MCP](https://geminicli.com/docs/tools/mcp-server/) · [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) · [Ollama](https://docs.ollama.com/api/openai-compatibility)

## Decisões de interface

- A navegação superior mantém Projeto, Tarefas, Custos, Integrações, Agentes e Skills. Projeto reúne Resumo e Pendências.
- Tema preto grafite com rosa-magenta para foco, seleção, ações primárias e dados nos gráficos. Verde indica sucesso, âmbar indica execução e vermelho sinaliza falha ou cancelamento. Os estados também têm rótulos.
- A marca usa dois traços que desenham uma passagem em forma de G. Geist e Lucide são distribuídos junto com a interface. Tabelas, painéis e formulários mantêm ações próximas de seus dados.
- Seleção de pasta nativa, navegação por teclado, foco visível e texto em português. “Aplicar configuração” e “Cancelar execução” descrevem a ação.
- Prévia antes de gravar. Aprovação SDD vinculada ao diff, HEAD e journal. Mudança de revisão exige nova decisão. A janela orienta a concluir ou cancelar antes de fechar.
- Os logs são texto plano. Foco visível, estado atualizado e recuperação de revisão vencida no diálogo. [Heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Referência de navegação: Linear](https://linear.app/changelog/2026-03-12-ui-refresh) · [Referência de consumo: Vercel](https://vercel.com/docs/ai-gateway/observability-and-spend/observability)

## Arquitetura da janela

O processo principal do Electron abre a janela e liga o renderer React ao subprocesso Node por IPC. O preload expõe apenas seleção de pasta, ações da interface e eventos do runtime. O renderer roda isolado, em sandbox, com Node desabilitado e conteúdo local. O Node externo continua responsável pelas invocações de MCP e hooks. A configuração existente e os journals continuam utilizáveis. [Segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security/)

## Próximas entregas

A próxima fase é Memória e contexto de tarefa. Mapa do projeto, atribuição de custos e consolidação da ajuda seguem no SDD. P2-004b completa progresso por etapa, reconciliação e compensação dos instaladores. Os ensaios autenticados por host, a prova de bloqueio no OpenCode, a telemetria externa, os orçamentos e a distribuição com runtime empacotado mantêm seus aceites próprios.

## Verificar Pendências e retomada

Use `npm run test:desktop:pending` em sessão gráfica. O comando compila o aplicativo e exercita a janela, IPC e bridge com um projeto descartável. Ele cobre filtros, revisão vencida, diagnóstico por operação, janela compacta e reabertura de um Flow aguardando revisão ou retomada. O smoke de abertura nos sistemas continua em `npm run test:desktop`.
