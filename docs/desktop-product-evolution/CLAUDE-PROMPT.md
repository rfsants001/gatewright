# Prompt de implementação para Claude Code

Você vai continuar o Gatewright como responsável pela implementação da lógica e da integração das telas. O usuário aprovou a evolução visual e pediu que o Codex desenhasse as páginas e preparasse PRD e TRD. Seu trabalho começa criando um SDD a partir deste pacote, depois executando a implementação por fases com checkpoints persistidos.

## Entrega integrada em 21/11/2026

P0–P7 e P2-004b implementadas no aplicativo. A validação atual está em [CHECKPOINT.md](CHECKPOINT.md) e [no registro do Electron](screens/validation-2026-11-21/README.md). O material em `ui/` continua sendo uma referência isolada com fixtures; as telas de produção estão em `desktop/renderer/`.

A entrega inclui memória com versões e seleção explícita, snapshot imutável de contexto, histórico de tarefas com ou sem medição, mapa Graphify com arquivo/diff, custos por atribuição, recuperação de recursos pertencentes à operação e ajuda por tela/ação/erro. A validação autenticada de serviços de terceiros e dos hosts em cada sistema operacional permanece uma matriz de ambiente, sem promessa de compatibilidade universal.

Não reinicie P4–P7: a implementação já existe. Leia o checkpoint e os resultados dos testes, confira os commits posteriores e trabalhe somente em regressões ou na matriz de hosts/serviços que estiverem disponíveis. Preserve os snapshots, a propriedade de recursos, o orçamento de contexto e a semântica de custos. A orquestração Sonnet/Haiku descrita abaixo continua sendo orientação para a sua execução; os limites de aprovação e validação permanecem iguais.

## Leitura inicial obrigatória

Trabalhe no checkout `~/dev/gatewright`. Leia os arquivos abaixo nesta ordem, conferindo os caminhos reais antes de usar.

1. Instruções AGENTS.md aplicáveis, git status e commits recentes. Preserve mudanças locais e entregas concorrentes.
2. `docs/desktop-product-evolution/README.md`.
3. `PRD.md`, `TRD.md`, `UI-SPEC.md` e `PHASES.md` no mesmo diretório.
4. `CHECKPOINT.md`, para identificar a fase e a próxima ação. Confira também o SDD que já existir para esta entrega.
5. Os contratos e testes das áreas que a fase vai alterar, indicados no TRD.md. Se houver SDDs históricos no checkout, consulte os trechos relevantes para preservar as decisões existentes.
6. A prévia `ui/dist/index.html`, as capturas em `screens/` e os componentes em `ui/preview.jsx`, `fixtures.js` e `design.css`.

A base inspecionada pelo Codex foi `b2dfd32`, em 20/11/2026. Os commits `10a059b`, `77b789d` e `328a646` já entregaram o configurador headless, as tools MCP e a troca de advisor. Confira o código atual antes de refazer qualquer uma dessas partes. A suíte da base passou com 849 testes usando registro temporário de projetos.

Na primeira sessão, faça a leitura completa do pacote e registre um resumo estável no SDD. Nas retomadas, comece pelo checkpoint, pelas tarefas da fase e pelos contratos que mudaram. Releia trechos do PRD e do TRD que afetem a tarefa atual ou tenham sido atualizados desde a última sessão. Isso mantém o contexto de trabalho concentrado na fase em execução.

## Resultado esperado

Transforme os desenhos em fluxos funcionais do desktop Electron com lógica compartilhada pelo runtime e pelo MCP. Reutilize a arquitetura, os adapters e as receitas existentes. O resultado deve permitir encontrar skills, entender e compor agentes, instalar e recuperar integrações, resolver pendências, selecionar memórias, explorar o mapa de código e investigar custos.

Mantenha a direção visual grafite com rosa-magenta, Geist, Lucide, navegação superior e componentes compactos. Preserve as seis áreas principais. As abas Pendências, Memória e Mapa ampliam Projeto, junto ao resumo existente. Ajuda contextual usa painel lateral. A prévia tem dados sintéticos e ações em memória. A produção precisa das fontes e dos estados reais definidos no SDD.

## Antes de implementar

Produza o SDD em `docs/desktop-product-evolution/sdd/`, com spec.md, design.md e tasks.md. Inclua requisitos rastreáveis, design técnico e tarefas identificáveis por fase. Mantenha os documentos deste pacote como fonte de produto e design. Se já houver um SDD equivalente em outra pasta, confira suas decisões e traga as referências necessárias para este destino.

O SDD precisa incluir pelo menos as entidades novas ou ampliadas, schemas, migrações, contratos IPC/MCP, eventos, snapshots, fontes de dados, revisão de concorrência, falhas parciais, acessibilidade e matriz de validação. Para cada requisito do PRD, associe contrato, ação da tela, tarefa e evidência esperada. Registre o que o código atual já cobre e o que precisa de trabalho.

Depois que o SDD estiver consistente, siga para a implementação autorizada. Decisões rotineiras não exigem uma aprovação por fase. Pergunte apenas se faltar informação material ou houver uma escolha que altere o objetivo do produto. Continue as partes independentes enquanto isso.

## Fases de trabalho

Execute P0 a P7 na ordem e com as dependências de PHASES.md. Termine cada subtarefa com um caminho funcional ou um contrato validado que a próxima subtarefa conectará. Não avance marcando uma fase como pronta porque seus arquivos isolados compilam. Confirme a entrada normal do desktop e os efeitos no runtime.

- P0 inventaria e cria o SDD.
- P1 entrega biblioteca de skills e ficha de agente com composição única.
- P2 entrega progresso persistido e recuperação de operações de integração.
- P3 entrega pendências e fecha FDR-007, incluindo revisão recuperada e retomada explícita.
- P4 entrega memória versionada e contexto selecionado na tarefa.
- P5 entrega mapa Graphify e relação com o diff.
- P6 entrega atribuição e investigação de custos.
- P7 fecha ajuda, estados, acessibilidade, regressão e evidências.

Entregue a ajuda e os estados da área junto de cada fase. A P7 faz a revisão transversal final.

## Cuidados técnicos específicos deste projeto

1. Amplie AgentProfile com campos opcionais e atualize o schema strict. Um perfil antigo precisa continuar sendo aceito. As instruções de prévia, execução, Flow e MCP devem sair da mesma composição. Preserve o snapshot do prompt em um Flow iniciado.
2. Skills internas `_system/` continuam fora de catálogos e prompts públicos. Origem, categoria e dependentes precisam ser derivados das fontes corretas.
3. O bridge ainda duplica parte do fluxo de configuração disponível no core do R2. Consolide só depois de preservar guardas, mensagens, revisões e journals dos caminhos existentes.
4. Um MCP invocado por IA consegue chamar a confirmação. A revisão humana é uma ação do cliente. Defina como o produto apresenta e vincula essa decisão e teste chamadas concorrentes da mesma revisão.
5. Reinstalar ou retomar comandos pode repetir efeitos. Persista IDs e revise o estado de pastas, pacotes e contêineres antes de repetir uma etapa. Teste de conexão deve verificar o recurso já instalado.
6. Para FDR-007, trate o evento flow.ask que pode chegar antes da resposta de open e antes de atualizar cwdRef. Atualize a allowlist IPC e a guarda busy quando a ação estiver ligada.
7. Memória precisa de escopo, origem, destinatários, seleção e versão. Um registro de outro projeto não pode entrar silenciosamente no contexto. Editar ou excluir o registro não deve modificar snapshots de runs já iniciados.
8. O DAG do Flow e o mapa de código têm semânticas próprias. Valide o formato real do Graphify da versão suportada e normalize paths para Linux, macOS e Windows.
9. Preserve a reconciliação de uso cumulativo e o significado de custo desconhecido. Somar por integração exige regra explícita que evite duplicar a despesa da mesma execução. Assinatura e cobrança externa exigem fonte própria.
10. Ação de abrir arquivo deve respeitar o projeto ativo, caminhos canônicos e o contrato permitido pelo Electron. Respostas atrasadas de outro projeto devem ser descartadas.

## Protocolo de checkpoint e retomada

No começo de toda sessão, leia CHECKPOINT.md, git status, git log e o diff da tarefa em andamento. Identifique o próximo item pendente no tasks.md do SDD. Atualize o checkpoint após cada subtarefa, antes de operações demoradas e antes de encerrar a sessão.

Registre fase, ID da tarefa, commit e branch, arquivos alterados, decisão tomada, verificação executada, resultado, operação em curso e próxima ação exata. Se o contexto estiver acabando, priorize esse registro. Não registre chaves, tokens ou informações pessoais que não sejam necessárias ao trabalho.

Se a sessão terminar abruptamente, na próxima abertura verifique os efeitos do último comando antes de repeti-lo. Registre incerteza e reconcilie a operação. O checkpoint e o SDD devem permitir retomar sem depender de recordar o histórico completo do chat.

Ao concluir uma fase, escreva um resumo curto com o que funciona pela interface, como foi verificado e o que a fase seguinte exige. Continue para a fase seguinte enquanto houver autorização, contexto e trabalho possível.

## Validação e entrega

Use testes para regressões concretas e execute checks apropriados à mudança. Na base, `npm run check` inclui typecheck, build e suíte. Use GATEWRIGHT_PROJECTS em diretório temporário nos testes do bridge, para não alterar o registro pessoal. Abra o Electron e exercite a operação real em projeto descartável. Registre versões dos hosts e diferencie configuração gerada, handshake MCP, autenticação e comportamento observado no host.

Quando o ambiente bloquear um ensaio, registre o erro e mantenha o aceite como pendente. Faça os checks independentes disponíveis. Não desabilite isolamento ou proteções do produto para obter um ensaio verde. Uma captura da prévia de design demonstra o desenho, e o aceite da implementação requer a tela ligada ao runtime.

Os documentos, checkpoints, telas e SDDs desta entrega ficam em `docs/desktop-product-evolution/`, conforme a orientação mais recente do usuário. O SDD de implementação usa a subpasta `sdd/`. Commits de código não levam Co-authored-by. Confira a autorização vigente para publicar na main, observando também alterações concorrentes. Atualize o README quando a funcionalidade e suas capturas reais estiverem prontas para publicação.

Comece pela próxima tarefa pendente indicada no CHECKPOINT.md. Confira a base encontrada, os contratos existentes e o plano persistido. Continue pela entrada normal do produto, mantendo o checkpoint atualizado e preservando as entregas já validadas.
