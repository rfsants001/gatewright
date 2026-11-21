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

## Instalar / compilar da fonte

Para gerar pacotes instaláveis a partir do código-fonte, é necessário ter Node 22.12+, Git e as dependências nativas do sistema para o electron-builder (`rpmbuild` para RPM, `dpkg-dev` para deb — normalmente já presentes em distribuições Linux populares).

```sh
npm ci
npm run dist:linux   # produz AppImage e .deb em release/
```

Os artefatos ficam em `release/` (ignorado pelo git). O script `dist:linux` gera AppImage (sem instalação, basta tornar executável) e pacote `.deb` (Debian/Ubuntu/Nobara com `dpkg`). O formato `.rpm` é gerado em CI (Ubuntu, RPM 4) via `dist:linux:all`; localmente em Fedora/Nobara com RPM 6 o `rpmbuild` falha por incompatibilidade com fpm 1.9.x — use o AppImage nesse caso.

Para Windows e macOS, os artefatos são gerados pelo workflow de CI a cada tag `v*` e ficam disponíveis como artefatos da action no GitHub (aba _Actions → Release → build on <os>_). Não há assinatura de código nos builds alpha; o macOS pode exibir aviso de Gatekeeper.

Para testar o empacotamento sem instalar (descompactado, mais rápido):

```sh
npm run pack   # cria release/linux-unpacked/ sem gerar instaladores
```

## Usar

- **Projeto** abre uma pasta, mostra projetos recentes e detecta hosts. A prévia da conexão informa os arquivos que serão atualizados. Em **Memória**, guarde decisões por projeto, usuário ou execução, com versões e destinatários. Selecione explicitamente o contexto em Tarefas; memórias pessoais ficam ocultas até opt-in. Em **Mapa**, leia ou gere Graphify local, busque símbolos e abra relações, arquivo e diff. Em **Pendências**, consulte aprovações, retomadas de Flow e falhas de instalação. Cada ação abre a revisão do run correspondente ou o diagnóstico da operação, conferindo a revisão atual da pendência.
- **Tarefas** executa um objetivo, transmite os eventos e permite cancelar. O histórico preserva objetivo, instruções e versões de memória, inclusive sem medição. Agente + memórias compartilham 20 KB UTF-8 e são congelados no início. O Flow SDD guia planejamento, aprovação, implementação e revisão. Ao reabrir o projeto, uma revisão pendente é recuperada e uma etapa interrompida aguarda a ação **Retomar**. A aprovação do diff registra a decisão vinculada ao snapshot atual.
- **Custos** exibe o uso registrado nos journals do projeto, com custo por dia, modelo e atribuição a agente, provedor, tarefa ou integração. O período de 7/30 dias vale para toda a análise. A seleção de grupo filtra as execuções e permite abrir contexto/tarefa. Integrações significam contexto habilitado com rateio explícito, não custo do SaaS. Valores ausentes ou parciais são sinalizados. Hosts abertos por fora precisam de uma fonte de telemetria para que seu consumo apareça aqui.
- **Skills** oferece busca, filtros de categoria e origem, corpo de instruções e os agentes dependentes. Crie playbooks no projeto em formato SKILL.md.
- **Agentes** mantém perfis com responsabilidades, entrada, saída e limites opcionais. Ordene as skills, confira as instruções combinadas e use o perfil numa tarefa. O mesmo compositor alimenta os prompts MCP.
- **Integrações** cadastra provedores de API ou proxy e recebe pedidos em linguagem natural. A pessoa revisa a proposta antes de aplicar as receitas de MCP, npm, Docker, Git, Graphify ou Jev. Operações e resultados de diagnóstico são persistidos. O histórico mostra etapas e recursos reais. Confira a operação e a revisão atual antes de remover recursos; ownership e versão são verificados. Reconciliar não reinstala. O estado revertido sai das pendências; operações antigas sem prova de propriedade precisam de conferência manual. O campo de credencial recebe o nome de uma variável de ambiente disponível ao desktop.

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

- A navegação superior mantém Projeto, Tarefas, Custos, Integrações, Agentes e Skills. Projeto reúne Resumo, Pendências, Memória e Mapa.
- Tema preto grafite com rosa-magenta para foco, seleção, ações primárias e dados nos gráficos. Verde indica sucesso, âmbar indica execução e vermelho sinaliza falha ou cancelamento. Os estados também têm rótulos.
- A marca usa dois traços que desenham uma passagem em forma de G. Geist e Lucide são distribuídos junto com a interface. Tabelas, painéis e formulários mantêm ações próximas de seus dados.
- Seleção de pasta nativa, navegação por teclado, foco visível e texto em português. “Aplicar configuração” e “Cancelar execução” descrevem a ação.
- Prévia antes de gravar. Aprovação SDD vinculada ao diff, HEAD e journal. Mudança de revisão exige nova decisão. A janela orienta a concluir ou cancelar antes de fechar.
- Os logs são texto plano. Foco visível, estado atualizado e recuperação de revisão vencida no diálogo. [Heurísticas de Nielsen](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Referência de navegação: Linear](https://linear.app/changelog/2026-03-12-ui-refresh) · [Referência de consumo: Vercel](https://vercel.com/docs/ai-gateway/observability-and-spend/observability)

## Arquitetura da janela

O processo principal do Electron abre a janela e liga o renderer React ao subprocesso Node por IPC. O preload expõe apenas seleção de pasta, ações da interface e eventos do runtime. O renderer roda isolado, em sandbox, com Node desabilitado e conteúdo local. O Node externo continua responsável pelas invocações de MCP e hooks. A configuração existente e os journals continuam utilizáveis. [Segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security/)

## Escopo entregue e trabalho restante

P0–P7 e P2-004b da evolução do desktop foram implementadas. Memória, Mapa, atribuição de custos, ajuda e recuperação de instalações já estão no aplicativo; não são próximas fases a reimplementar.

A visão completa do produto ainda tem frentes distintas:

- **Execução com ferramentas em API/proxy:** o adapter direto atual faz completação textual compatível com OpenAI. Falta o ciclo de chamadas de ferramentas/MCP para editar e executar trabalho por esse caminho. O adapter Codex do desktop continua com `--sandbox read-only` no piloto.
- **Telemetria de sessões externas:** o painel agrega journals de execução; sessões iniciadas diretamente no terminal precisam de uma fonte de telemetria. Ter MCP/hooks configurados não equivale a receber automaticamente todo o consumo do host.
- **Cobertura de preços:** a tabela embutida estima famílias Claude. Outros modelos ficam sem custo estimado se não houver preço/custo disponível; a conversão BRL é local e fixa. Configuração extensível e atualização de preços/câmbio são trabalho de produto.
- **Aceite autenticado:** rodar tarefas reais em Claude/Codex/Gemini/OpenCode, conferir MCP/harness com a janela fechada, comprovar o bloqueio dentro do OpenCode e ensaiar Docker/MCPs/proxies reais. Os smokes novos usam um provedor local controlado.
- **Distribuição desktop:** instaladores nativos com runtime empacotado, assinatura e atualização ainda precisam de uma entrega própria. A inicialização por Node/npm é multiplataforma; `desktop:install` cria o atalho Linux ligado ao checkout e ao Node existentes.

A inicialização passou no CI em Linux/macOS/Windows. Os fluxos novos completos foram ensaiados no Linux; ainda falta repetir essa matriz funcional nos outros sistemas. O registro de execução está em [CHECKPOINT.md](desktop-product-evolution/CHECKPOINT.md).

## Verificar Pendências e retomada

Use `npm run test:desktop:pending` em sessão gráfica. O comando compila o aplicativo e exercita a janela, IPC e bridge com um projeto descartável. Ele cobre filtros, revisão vencida, diagnóstico por operação, janela compacta e reabertura de um Flow aguardando revisão ou retomada. O smoke de abertura nos sistemas continua em `npm run test:desktop`.

## Ensaios da evolução

```sh
npm run test:desktop
npm run test:desktop:pending
npm run test:desktop:evolution
```

Os smokes usam projetos e perfis temporários em sessão gráfica. O último exercita memória → agente → provedor HTTP local → snapshot → custo → mapa/diff → recuperação → reinício e scroll. Não usa uma assinatura externa. Evidências, versões e limites em [validação de 21/11](desktop-product-evolution/screens/validation-2026-11-21/README.md).

Graphify instalado pelo app usa `uv venv --allow-existing` e versão fixada. A geração de código executa `python -m graphify extract . --code-only --no-cluster --out .`, produzindo graphify-out/graph.json. A UI lê `nodes` + `edges`/`links`; preserva o último mapa válido se a nova leitura falhar. Exibe até 4.000 nós/12.000 relações de um artefato de até 20 MB; a lista permite acessar resultados fora dos 160 desenhados por vez. Arquivo maior que 512 KB ou binário precisa do editor.

MCP de memória: memory_list/upsert/delete/resolve. Operações: integration_operation (list/inspect/reconcile/cleanup). A remoção requer aprovação humana da revisão inspecionada e prova de propriedade.
