# Gatewright — PRD da evolução do desktop

Data de referência 20/11/2026. Base observada `b2dfd32` sobre os commits R2 `10a059b`, `77b789d` e `328a646`. O SDD e a entrega integrada estão em `sdd/`; esta introdução preserva a base de planejamento. As telas propostas estão em `ui/dist/index.html`. Os dados e as ações da prévia são simulados.

## Entrega integrada em 21/11/2026

P0–P7 e P2-004b implementadas no aplicativo. A validação atual está em [CHECKPOINT.md](CHECKPOINT.md) e [no registro do Electron](screens/validation-2026-11-21/README.md). O material em `ui/` continua sendo uma referência isolada com fixtures; as telas de produção estão em `desktop/renderer/`.

A entrega inclui memória com versões e seleção explícita, snapshot imutável de contexto, histórico de tarefas com ou sem medição, mapa Graphify com arquivo/diff, custos por atribuição, recuperação de recursos pertencentes à operação e ajuda por tela/ação/erro. A validação autenticada de serviços de terceiros e dos hosts em cada sistema operacional permanece uma matriz de ambiente, sem promessa de compatibilidade universal.

## Objetivo de produto

Permitir que uma pessoa entenda o que cada agente faz, encontre suas skills, acompanhe uma instalação, resolva pendências e escolha o contexto de uma tarefa. A investigação de um custo ou dependência deve chegar à execução ou ao arquivo de origem.

O desktop permanece como centro de configuração de projetos. Claude Code, Codex, Gemini CLI, OpenCode, Ollama e provedores de API ou proxy continuam sendo opções de execução conforme suas capacidades. MCP e harness devem funcionar com a janela fechada. Os recursos aceitos na interface também precisam de contratos consumíveis pelo runtime e pelos clientes MCP quando aplicável.

## Situação encontrada na P0 (histórico)

| Recurso | Evidência atual | Evolução esperada |
| --- | --- | --- |
| Skills | SKILL.md, catálogo distribuído e de projeto, criação manual, prompts MCP | Busca, categoria, origem, dependentes e detalhe |
| Agentes | Perfil com nome, objetivo e skills ordenadas, prévia, tarefa e prompt MCP | Responsabilidades, entradas, saídas e limites com compatibilidade dos perfis existentes |
| Integrações | Proposta revisável, receitas npm, Docker, Git, Graphify, Jev e MCP HTTP, teste de handshake | Progresso por etapa, resultado persistido e recuperação que respeita efeitos já executados |
| R2 | Configurador headless e tools integrate_tool/set_module_enabled, advisor HTTP e testes | Reutilizar esses contratos no desktop e tratar suas lacunas de aprovação e operação |
| Pendências | Flow persiste e reconstitui estado no bridge | Fechar FDR-007 e projetar ações pendentes para a janela |
| Memória | Nenhum domínio persistente encontrado na inspeção de src/core | Armazenamento, seleção explícita e snapshot por execução |
| Mapa | Há grafo de execução e grafo de módulos | Integração com o grafo de código do Graphify e relação com o diff |
| Custos | Agregação local por modelo, execução e dia | Registrar atribuição suficiente para agrupar por agente, provedor e integração |

O perfil de agente composto por skills e o registro de agentes do scheduler têm responsabilidades diferentes no código atual. O SDD precisa definir uma ligação quando necessária, preservando as chamadas existentes.

## Organização da interface

Manter a navegação principal Projeto, Tarefas, Custos, Integrações, Agentes e Skills. Projeto mantém o resumo existente e recebe as abas Pendências, Memória e Mapa. A prévia apresenta essas três abas novas. O resumo atual continua sendo a entrada do projeto na implementação.

A ajuda contextual abre em um painel lateral a partir do cabeçalho ou do estado de erro. O protótipo usa uma faixa externa de demonstração e um seletor de estado para revisão do desenho. Eles pertencem ao material de design.

## Requisitos e aceites

### SK — Biblioteca de skills

- SK-01. Buscar por nome e descrição, filtrar por categoria e origem. Mostrar contagem derivada do resultado. Limpar filtros recupera a lista.
- SK-02. Abrir o corpo das instruções, o identificador e a origem. Categoria vem de skillKind ou de um mapeamento documentado.
- SK-03. Mostrar agentes dependentes com links para o perfil. Uma skill ausente em um perfil deve gerar um aviso útil ao compor ou executar.
- SK-04. Preservar criação em SKILL.md e prompts MCP. Skills internas continuam ocultas no catálogo e na ajuda pública.
- Aceite. Com uma skill de projeto e uma distribuída de mesmo nome, exibir a precedência já usada pelo catálogo. Busca sem resultado oferece limpar filtros. Arquivo inválido é identificável sem derrubar a tela.

### AG — Ficha e composição do agente

- AG-01. Persistir responsabilidades, entrada esperada, saída esperada e limites como campos opcionais. Perfis antigos continuam editáveis e executáveis.
- AG-02. Ter abas Ficha, Skills e Instruções. As instruções completas refletem os campos e a ordem das skills.
- AG-03. Reordenar por botões acessíveis e salvar. Uma única composição do runtime alimenta prévia, execução, Flow e prompt MCP.
- AG-04. Usar em tarefa leva o perfil selecionado para o compositor existente. Modelo, provedor e capacidades do host são escolhidos ali.
- AG-05. Limites descritos na ficha entram no contexto do agente. A interface deve manter as verificações reais do harness e as aprovações vinculadas à revisão.
- Aceite. O prompt usado no run corresponde à prévia aprovada. Reabrir o projeto mantém a ordem. Mudança posterior de skill não altera o snapshot de um Flow iniciado.

### IN — Instalações e saúde das conexões

- IN-01. Propor, revisar, aplicar e acompanhar as etapas da receita com rótulos claros. Apresentar origem, versão ou digest, destino, escopo e pré-requisitos antes de confirmar.
- IN-02. Diferenciar instalado, registrado, aguardando artefato, verificado e autenticado quando houver evidência. Salvar tentativa, horário, fase, erro resumido e evidência da medição de latência.
- IN-03. Retentar um teste de conexão deve executar o teste. Retomar uma instalação exige reconciliar o que já foi criado.
- IN-04. Atualizar a tela ao receber progresso. Ao reabrir o projeto, recuperar o estado da operação pelo identificador.
- IN-05. Guardar uma ação recuperável para falhas parciais. Remover ou reverter recursos exige identificar os arquivos ou serviços pertencentes àquela operação.
- IN-06. Preservar todas as receitas e projetos vinculados existentes. Consultar a skill interna com o provedor escolhido e manter a confirmação do plano. A evolução também deve cobrir o caminho MCP do R2.
- Aceite. Se a instalação terminar e o handshake falhar, mostrar instalado e não verificado. Testar novamente não reinstala o pacote nem duplica um contêiner. Fechar ou falhar no meio mantém uma evidência suficiente para recuperar.

### PE — Pendências do projeto

- PE-01. Projetar aprovações aguardando decisão, execuções interrompidas e falhas de conexão acionáveis a partir do estado real.
- PE-02. Cada linha oferece uma ação contextual e um vínculo ao run, Flow ou operação de integração. A contagem acompanha o filtro e a resolução do item.
- PE-03. A retomada de run interrompido passa pela revalidação do processo, journal, revisão e estado do repositório. Concluir FDR-007 na fase correspondente.
- Aceite. Abrir um projeto com revisão pendente apresenta o snapshot atual. Aprovar uma revisão obsoleta exige reabrir. A interface evita iniciar uma segunda execução para o mesmo ponto de retomada.

### ME — Memória e contexto

- ME-01. Criar, editar, buscar e excluir registros de tipo Decisão, Preferência ou Aprendizado, com escopo Usuário, Projeto ou Execução.
- ME-02. Todo registro apresenta origem, atualização e associação com projeto ou run quando aplicável. Uma sugestão produzida por IA exige uma ação para ser salva.
- ME-03. Definir destinatários por perfil e permitir selecionar registros no compositor da tarefa. Memórias do usuário oferecidas a outro projeto exigem escolha explícita. Origem do registro fica disponível ao revisar o contexto.
- ME-04. O run recebe um snapshot da seleção com versões e conteúdo. Editar ou excluir a memória altera a disponibilidade para execuções futuras. A UI explica o tratamento do histórico já gravado.
- ME-05. Mostrar erros de limite de contexto antes de iniciar a tarefa. As memórias devem consumir o mesmo orçamento de instruções definido pelo runtime.
- Aceite. Um registro do projeto A não aparece como contexto automático do projeto B. Editar uma memória depois do início não muda o prompt daquela execução. Criar uma memória no desktop e selecioná-la em tarefa deve funcionar também no caminho compartilhado do runtime.

### MP — Mapa do projeto

- MP-01. Ler uma representação validada do grafo do Graphify, mostrar origem e data de indexação e oferecer mapa e lista equivalentes.
- MP-02. Selecionar módulo ou relação revela arquivo e vínculos diretos. Abrir arquivo usa o projeto ativo e a ação permitida pelo Electron.
- MP-03. Relacionar nós aos arquivos alterados do diff. Apresentar dependentes como possíveis consumidores a revisar, com a origem da relação disponível.
- MP-04. Ausência de Graphify oferece conectar ou instalar. Ausência de grafo oferece a geração quando suportada pela receita implementada. Atualizar mostra progresso, falha e horário da última versão válida.
- Aceite. A lista permite chegar aos mesmos detalhes por teclado. Grafo inválido preserva a última versão válida e informa o problema. Grafo grande é limitado ou paginado de forma explícita.

### CU — Custos investigáveis

- CU-01. Manter gráficos atuais por dia e modelo. Acrescentar agrupamentos por agente, provedor, tarefa e integração, com seleção que filtra a lista de execuções.
- CU-02. Atribuição só aparece quando foi registrada. Dados antigos e relações desconhecidas entram em Sem atribuição.
- CU-03. Custos reportados, estimados e sem preço preservam sua origem. Totais parciais mostram quantas execuções têm custo ausente. Zero é exibido quando a fonte fornece zero.
- CU-04. Relação com uma integração expressa uso de modelos atribuído à execução. Uma despesa do SaaS depende de fonte própria para ser apresentada como cobrança do serviço.
- Aceite. A soma da lista filtrada corresponde ao total selecionado. Filtrar por agente preserva o período. Dado cumulativo do host é reconciliado uma vez, como já faz o agregador.

### AJ — Ajuda contextual

- AJ-01. Abrir ajuda relacionada à tela, campo ou erro, com ações que levam ao fluxo correspondente.
- AJ-02. Incluir ajuda de autenticação, gráfico ausente, revisão vencida, custo desconhecido e retomada interrompida.
- AJ-03. Foco entra no painel, Escape fecha e foco retorna à ação de origem. A operação corrente mantém seus dados.
- Aceite. Navegar entre links de ajuda leva à página certa sem perder o projeto ativo. O texto descreve comportamentos entregues naquela fase.

## Estados compartilhados

Cada recurso precisa de cenários com dados, carregando, vazio, erro recuperável e conteúdo parcial quando aplicável. Mensagens de erro devem indicar o efeito observado e a ação disponível. Ao trocar de projeto, cancelar ou descartar respostas que pertencem à seleção anterior.

## Critérios de experiência

Tema grafite e rosa-magenta da versão atual, Geist, Lucide e escala compacta de controles. Manter foco visível, rótulos textuais para estado e rolagem vertical. Em 780 × 580, o formulário e as ações principais devem ser alcançáveis por teclado. A adaptação para larguras menores pode empilhar painéis e oferecer listas para grafos.

Usar elementos existentes de navegação e linguagem de tarefas. As referências visuais fornecidas motivaram funcionalidades, e o desenho utiliza o sistema do Gatewright. Componentes e textos apresentados neste pacote são específicos ao produto.

## Medição de aceite

Validar o primeiro caminho completo de cada fase com projeto descartável. Registrar passos, ambiente, o que foi observado, a evidência e o que depende de um host real. Indicadores futuros podem medir tempo para encontrar uma skill, tempo de recuperação e proporção de custos atribuídos. O pacote não contém medição de usuários reais.

## Sequência

P0 inventário e SDD. P1 biblioteca e ficha do agente. P2 progresso de integrações. P3 pendências e FDR-007. P4 memória. P5 mapa. P6 custos. P7 ajuda, regressão e publicação conforme autorização vigente. Os detalhes e dependências estão em PHASES.md.
