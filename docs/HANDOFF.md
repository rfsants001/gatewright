# Retomar o Gatewright

Atualizado em 21/11/2026. A continuação após main 1ac6388 concluiu P2-004b e P4–P7 da evolução do desktop.

Comece em [CHECKPOINT.md](desktop-product-evolution/CHECKPOINT.md), [sdd/tasks.md](desktop-product-evolution/sdd/tasks.md) e [TRD.md](desktop-product-evolution/TRD.md#contratos-entregues). Confira git status/log e o CI antes de alterar. Não reinicie as fases já concluídas.

Memória tem versões, isolamento, seleção explícita e snapshot imutável no run/Flow. O histórico de tarefas independe de custo. O mapa lê e gera Graphify, relaciona Git e abre arquivo/diff com contenção canônica. Custos compartilham período e agrupam por agente, provedor, tarefa e integração, preservando origem/desconhecido. A instalação compartilha receitas, reporters e mutex entre desktop/MCP; a recuperação verifica propriedade e versão antes de remover. Ajuda usa dialog modal nativo.

A evidência e os comandos estão no [registro de validação](desktop-product-evolution/screens/validation-2026-11-21/README.md). O ensaio Electron executa um provedor HTTP local de teste e confere contexto recebido e histórico original após editar/reiniciar. Graphify 0.9.114 foi instalado, gerou código e foi removido por sua operação em diretórios temporários.

A continuação de ambiente é validar hosts e serviços autenticados quando disponíveis, sem afirmar que assinaturas/proxies de terceiros já foram testados. Inicialização multiplataforma está no CI; fluxos completos desta entrega foram ensaiados no Linux. Operação antiga sem prova de propriedade não é removida automaticamente. Consulte os limites no checkpoint.

Documentos em docs/desktop-product-evolution, commits sem Co-authored-by. .specs e vault permanecem fora dos commits.
