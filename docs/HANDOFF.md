# Retomar o Gatewright

Atualizado em 21/11/2026. A base recebida do Claude foi 27a393d. A continuação de código d0441e4 concluiu a ligação da tela de Pendências e a validação de retomada pela janela do Electron.

## Ponto de partida

Comece em docs/desktop-product-evolution/CHECKPOINT.md e sdd/tasks.md. O pacote mantém o PRD, TRD, telas de referência, fases e prompt de retomada. O próximo domínio é P4, Memória e contexto. A entrega atual usa a branch main. Confira git status e os commits posteriores antes de editar.

## Implementado e validado

Skills e Agentes oferecem catálogo pesquisável, ficha ampliada e composição ordenada. Integrações tem proposta, confirmação, operações persistidas e diagnóstico. Projeto → Pendências consulta os journals, abre a revisão correta e apresenta falhas de instalação com o ID da operação. A decisão de review exige o snapshot atual.

O Flow recupera sua revisão na abertura do projeto e pede uma ação explícita para retomar um run interrompido. Uma segunda chamada de retomada durante execução ativa é recusada. Runs do Flow seguem seu próprio caminho de revisão.

npm run check passou em 946 testes. Os comandos npm run test:desktop e npm run test:desktop:pending passaram no Linux com projeto descartável. O registro e as capturas ficam em docs/desktop-product-evolution/screens/validation-2026-11-21/README.md.

## Próximas entregas

P4 implementa memória versionada e seleção de contexto. P5 conecta o mapa de código do Graphify. P6 entrega atribuição de custos. P7 consolida ajuda, acessibilidade e aceite completo. P2-004b ainda precisa de progresso fino, evidência por efeito, reconciliação e compensação dos instaladores. Ensaios autenticados por host, telemetria externa e prova de bloqueio no OpenCode mantêm aceites separados.

Os documentos desta evolução ficam em docs/desktop-product-evolution. A vault e .specs continuam como referências locais. Commits sem Co-authored-by.
