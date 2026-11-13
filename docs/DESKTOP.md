# Gatewright Desktop

Gatewright é um painel local para projetos que usam agentes de código. A janela usa GTK 4 no Linux. O runtime continua em TypeScript/Node e é compartilhado com o terminal.

## Executar

Requisitos do piloto: Linux com sessão gráfica, Node 22+, Git, Python 3, PyGObject e GTK 4. Instale e autentique os hosts que pretende usar.

```sh
npm ci
npm run build
npm run desktop -- /caminho/do/projeto
```

Para criar a entrada no menu, rode `npm run desktop:install`. O atalho usa o checkout e o Node existentes. Se mover o checkout ou trocar o caminho do Node, reinstale o atalho e reaplique as conexões dos hosts. Em sessão gráfica Linux, `gate` abre o desktop. Use `gate dashboard` para a TUI e `gate desktop` para abrir a janela explicitamente.

## Usar

- **Projeto** abre uma pasta, mostra projetos recentes e detecta hosts. A prévia da conexão informa os arquivos que serão atualizados. Aplique e reinicie o host. Respeite os avisos de confiança e permissões do host.
- **Execução** roda uma tarefa, transmite os eventos, mostra o resultado e permite cancelar. O fluxo SDD guia planejamento, aprovação, implementação e revisão. Push e PR ficam a cargo do usuário nesta superfície. A aprovação do diff registra a decisão no journal.
- **Consumo** exibe o que o runtime registrou no projeto. Um host aberto por fora pode acessar skills e resources MCP, sem enviar automaticamente sua telemetria para o Gatewright. Custos estimados ou reportados são distintos de faturas de assinatura.
- **Configuração** cadastra um endpoint compatível com `/chat/completions`. Use HTTPS ou HTTP loopback. O campo de credencial aceita o nome de uma variável, como `OPENROUTER_API_KEY`. O processo do desktop precisa receber essa variável. A janela também gera propostas para criar uma skill, vincular um projeto, cadastrar um provedor, adicionar um servidor MCP HTTP ao Claude Code ou cadastrar no OpenCode um pacote com versão fixa para o próprio host carregar.

## Compatibilidade do piloto

| Origem | Execução do desktop | Terminal |
| --- | --- | --- |
| Claude Code | Adapter do binário. Autenticação nativa ou credenciais de API conforme a configuração do usuário e do fornecedor. | MCP e hooks do registro padrão em eventos cobertos. |
| Codex | Adapter do binário, com sandbox somente leitura para o piloto. | MCP e configuração inline de hooks. O Codex pode exigir confiança no repo e nos hooks. |
| Gemini CLI | Adapter de JSONL. | MCP e tradução dos hooks de ferramenta e fim de turno. |
| OpenCode | Adapter de JSONL. | Registro MCP em `opencode.json`. Integrar e verificar hooks do harness continua em aberto. |
| Ollama | Endpoint local compatível com OpenAI. Informe um modelo já instalado. | Um host como OpenCode pode usar o modelo e carregar o MCP. |
| API ou proxy externo | Endpoint compatível com OpenAI, com chave referenciada por ambiente quando necessária. | Configurado no host externo. A execução direta do Gatewright é textual. |

Use login e assinaturas pelas opções oficiais dos hosts. O Gatewright não lê nem repassa tokens OAuth da assinatura. [Claude Code](https://code.claude.com/docs/en/legal-and-compliance) · [Codex MCP](https://developers.openai.com/codex/mcp) · [Gemini MCP](https://geminicli.com/docs/tools/mcp-server/) · [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) · [Ollama](https://docs.ollama.com/api/openai-compatibility)

## Decisões de interface

- Hierarquia por tarefa, com as mesmas quatro áreas em todas as vistas. A interface abre no projeto, o contexto das ações.
- Fundo quente, superfícies claras e verde escuro na ação principal. Vermelho reservado para erro e cancelamento. Estado e resultado têm texto, inclusive quando a cor é difícil de distinguir.
- Controles nativos, seleção de pasta, foco por teclado e texto em português. “Aplicar configuração” e “Cancelar execução” descrevem a ação.
- Prévia antes de gravar. Aprovação SDD vinculada ao diff, HEAD e journal. Mudança de revisão exige nova decisão. A janela orienta a concluir ou cancelar antes de fechar.
- Os logs são texto plano, com ações ao lado da execução. [Heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/)

## Próximas entregas

Concluir a revisão de navegação e teclado da janela e o dogfood por host e versão, incluindo conexão MCP interativa. Completar a configuração de OpenCode, reconciliar eventos de sessões externas, unificar medição e orçamentos, e persistir as etapas do Flow para retomada depois de fechar. O instalável com runtime empacotado, o catálogo de plugins executáveis e o SmartRouter ainda precisam de implementação e aceite.
