# Gatewright — especificação das telas propostas

## Entrega integrada em 21/11/2026

P0–P7 e P2-004b implementadas no aplicativo. A validação atual está em [CHECKPOINT.md](CHECKPOINT.md) e [no registro do Electron](screens/validation-2026-11-21/README.md). O material em `ui/` continua sendo uma referência isolada com fixtures; as telas de produção estão em `desktop/renderer/`.

A entrega inclui memória com versões e seleção explícita, snapshot imutável de contexto, histórico de tarefas com ou sem medição, mapa Graphify com arquivo/diff, custos por atribuição, recuperação de recursos pertencentes à operação e ajuda por tela/ação/erro. A validação autenticada de serviços de terceiros e dos hosts em cada sistema operacional permanece uma matriz de ambiente, sem promessa de compatibilidade universal.

As capturas de produção estão em `screens/validation-2026-11-21/evolution/`. Projeto contém Resumo, Pendências, Memória e Mapa. Tarefas oferece seleção explícita de versões e histórico; Custos compartilha um período único e abre o contexto da tarefa. Integrações mantém histórico reabrível e decisão separada para remoção. A ajuda usa dialog nativo do Electron/Chromium para foco modal e Escape.


## Entregáveis visuais

A prévia navegável está em `ui/dist/index.html`. Para recompilar a partir da raiz do projeto, executar `node docs/desktop-product-evolution/ui/build.mjs`. A pasta `ui/` contém React, fixtures e estilos da proposta. A pasta `screens/` contém capturas para consulta no SDD.

A prévia usa CSS base, marca, Geist e Lucide existentes no Gatewright. O protótipo executa interações de apresentação em memória. Faixa de demonstração, seletor de cenários e notificações que descrevem a simulação pertencem ao pacote de design.

## Estrutura

- Navegação principal com as seis áreas atuais. A pasta permanece visível à direita.
- Projeto mantém o Resumo existente e recebe Pendências, Memória e Mapa. A prévia cobre as três abas novas.
- Título da página e objetivo curto. Ação principal no canto direito quando disponível.
- Painéis em duas colunas para lista e detalhe. Em janela estreita, empilhar e preservar a seleção.
- Ajuda acessível pelo ícone no cabeçalho e pelo rodapé. Drawer com ação de fechar visível e Escape.

## Tokens e composição

| Elemento | Referência |
| --- | --- |
| Fundo | --canvas, #101014 |
| Painel | --surface, #15151b |
| Seleção | --selected, #2c1b2a |
| Acento | --accent, #fd82c6 |
| Texto | --text, #f5f2f7 |
| Texto secundário | --muted, #aaa6b6 |
| Sucesso | --success, #91d6af, com texto |
| Falha | --error, #ff9b9b, com texto e ação |
| Atenção | --progress, #edc081, com texto |
| Fonte | Geist distribuída com o app |
| Ícones | Lucide, 13 a 19 px em ações e listas |
| Espaçamento | 6/8/12/16/18/24/28 px conforme densidade e hierarquia |
| Controles | Altura mínima de 34 px na proposta |

Acento indica foco, seleção e ação principal. Tabelas usam linhas discretas, alinhamento consistente e detalhes próximos ao item. Cores de status acompanham rótulos. Os layouts priorizam o trabalho corrente, com pouco texto explicativo fora de ajuda e decisões.

## Telas e interação

| Rota de prévia | Elementos | Caminho que deve ser implementado |
| --- | --- | --- |
| ?view=pending | Contagem por tipo, filtros, linhas com ação | Abrir revisão, revalidar retomada ou navegar ao diagnóstico |
| ?view=skills | Busca, categoria, tabela, detalhe e dependentes | Filtrar, abrir skill, navegar ao agente e criar playbook |
| ?view=agents | Lista de perfis, abas Ficha/Skills/Instruções | Ler responsabilidades, ordenar skills, conferir texto e usar em tarefa |
| ?view=install | Revisão da origem, etapas, pré-requisitos e saúde | Confirmar proposta, acompanhar aplicação, testar etapa pendente |
| ?view=memory | Escopos, busca, lista, origem e destinatários | Criar, editar, excluir com confirmação e selecionar em tarefa |
| ?view=map | Alternância mapa/lista, seleção de módulo, relações | Consultar grafo válido e relacionar ao diff |
| ?view=costs | Dimensão, métricas, barras, tabela e detalhe de run | Filtrar por grupo e chegar ao run de origem |
| ?view=tasks | Compositor e revisão com contexto selecionado | Usar perfil e memória no preparo do run |
| ?view=help | Ajuda sobre integrações em drawer | Concluir a ação local mantendo formulário e projeto |

### Biblioteca

Na tabela, priorizar nome, categoria, origem e número de agentes. Abrir uma linha mantém os filtros. O detalhe mostra o corpo e dependentes com ação de navegação. Se uma edição de skill distribuída for oferecida em fase futura, explicitar a criação de variante de projeto.

### Perfil

A ficha apresenta responsabilidade e contrato de entrada/saída. Limites vêm na sequência, antes de escolher executar. Na aba Skills, botões subir/descer permitem reordenação por teclado. Instruções apresenta o texto completo. A ação Usar em tarefa é o principal caminho do perfil.

### Integração

A coluna principal organiza a aplicação em etapas. A coluna de apoio reúne origem, versão, destino, escopo, pré-requisitos e verificações. Os valores de versão da prévia são ilustrativos. Em produção, apresentar a versão ou digest efetivo.

A simulação Aprovar e instalar avança até uma falha de verificação. Testar conexão novamente resolve apenas a verificação na prévia. Esse estado é a referência de falha parcial a implementar. A UI de produção recebe os efeitos observados pelo runtime.

### Memória

Escopos usam rótulos Usuário, Projeto e Execução. Registro selecionado mostra origem e alcance. Novo registro e edição abrem drawer. Exclusão apresenta uma decisão específica. A seleção no compositor deve mostrar o conteúdo enviado, seu escopo e a identidade da versão.

### Mapa

O desenho de exemplo mostra relações entre módulos, contratos e consumidores. Oferecer a mesma consulta em lista. Seleção destaca um módulo e suas relações diretas. Quando o diff estiver relacionado, o detalhe explica a evidência do vínculo e o impacto possível. A UI real deve mostrar o recorte do grafo que carregou.

### Custos

Seleção de dimensão altera o agrupamento. Seleção de um grupo restringe os totais e a lista. O drawer do run mostra fonte, metadados e ação Abrir tarefa. O gráfico do protótipo cobre o agrupamento novo. Os gráficos existentes por dia e modelo permanecem na implementação.

### Pendências e ajuda

Pendências não é um segundo armazenamento de tarefas. A lista deriva de revisões, runs e operações. Abrir uma linha usa os identificadores e a revisão da fonte. Ajuda acompanha a tela e códigos de erro estáveis, podendo encaminhar a uma ação de conexão ou preparação.

## Estados

O seletor externo da prévia alterna Com dados, Carregando, Sem registros e Falha ao carregar. O estado vazio em produção deve ser específico ao domínio, por exemplo Sem skills com estes filtros ou Graphify aguardando grafo. Loading mantém os rótulos da área e sinaliza aria-busy. Erro mantém a pasta e oferece atualizar ou ação de recuperação conhecida.

## Acessibilidade e aceite visual

- Um título principal por área, tabelas com cabeçalhos e inputs com labels.
- Ícones decorativos marcados como tal na implementação.
- Foco visível na ordem de leitura. Busca, filtros, reordenação e links funcionam por teclado.
- Drawer contém foco, fecha com Escape e retorna ao acionador. Evitar remontar o formulário por atualizações de snapshot.
- Rolagem vertical no main e interna em conteúdo longo. O rodapé permanece alcançável.
- Conferir 1440 × 960, 1120 × 860 e 780 × 580. A janela atual tem mínimo próximo dessa largura.
- Foco, estados, contraste e mensagens atendem às heurísticas de visibilidade do sistema, controle, consistência, prevenção de erro, recuperação e reconhecimento.

## Transferência para produção

Usar os componentes existentes como base e traduzir os painéis em componentes com dados e callbacks tipados. Separar estilo base de regras específicas da tela. Campos novos e ações que ainda não têm backend entram quando a fase correspondente estiver integrada. A prévia serve de referência de layout, conteúdo e comportamento local.
