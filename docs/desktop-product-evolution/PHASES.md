# Fases de implementação e retomada

## Entrega integrada em 21/11/2026

P0–P7 e P2-004b implementadas no aplicativo. A validação atual está em [CHECKPOINT.md](CHECKPOINT.md) e [no registro do Electron](screens/validation-2026-11-21/README.md). O material em `ui/` continua sendo uma referência isolada com fixtures; as telas de produção estão em `desktop/renderer/`.

A entrega inclui memória com versões e seleção explícita, snapshot imutável de contexto, histórico de tarefas com ou sem medição, mapa Graphify com arquivo/diff, custos por atribuição, recuperação de recursos pertencentes à operação e ajuda por tela/ação/erro. A validação autenticada de serviços de terceiros e dos hosts em cada sistema operacional permanece uma matriz de ambiente, sem promessa de compatibilidade universal.


## Estado em 21/11/2026

P0–P7 e P2-004b concluídas. As evidências e os contratos finais estão em CHECKPOINT.md, TRD.md e sdd/tasks.md. A próxima continuação é a matriz de hosts/serviços autenticados quando houver ambiente disponível. Não reabrir fases concluídas sem uma regressão reproduzida.

## Regras de execução

Concluir cada fase com uma fatia verificável pela entrada normal do produto. Atualizar o checkpoint após uma mudança relevante, antes de operações longas e ao encerrar. Ler o checkpoint no início da sessão seguinte. Só marcar um aceite verificado com evidência de execução. Registrar problemas do ambiente junto do comando e do efeito observado.

A autorização deste pacote permite ao Claude criar o SDD e implementar a lógica por fases. Não é necessário pedir autorização de novo a cada fase. Quando uma informação externa for necessária, avançar no trabalho independente e registrar a pergunta específica. Instalações de teste devem usar ambiente descartável. Credenciais reais e serviços do usuário precisam do contexto e da autorização correspondentes.

A orientação atual do usuário mantém o pacote em docs/desktop-product-evolution e o SDD na subpasta sdd/. Commits continuam sem Co-authored-by. Antes de publicar, conferir a autorização vigente para branch e push. Preservar alterações concorrentes do usuário.

## P0 — Inventário e SDD

Ler PRD.md, TRD.md, UI-SPEC.md e a prévia. Conferir git status, commits desde a base documentada, schemas, IPC, chamadas MCP e testes relevantes. Criar o SDD com spec.md, design.md e tasks.md em docs/desktop-product-evolution/sdd/, referenciando este pacote. Acrescentar a matriz de rastreabilidade REQ → contrato → tela → teste.

Definir IDs de tarefa por fase e ordem de dependência. Registrar decisões sobre versões de config, estados de operações, snapshot de memória e atribuição de custo. O design de software pode ajustar os DTOs propostos quando a inspeção indicar uma forma melhor. Manter os aceites de produto.

Saída verificável com inventário, arquivos reais, decisões justificadas, checkpoints e primeira fase pronta para execução. Persistir o plano antes de começar a implementação.

## P1 — Skills e ficha dos agentes

Dependência de P0. Ampliar DTO de skills, busca, categoria, origem, dependentes e detalhe. Atualizar AgentProfile, seus leitores e o compositor com campos opcionais da ficha. Implementar atualização e reordenação com revisão. Ligar Usar em tarefa e prompts MCP à composição única.

Aceites SK-01 a SK-04 e AG-01 a AG-05. Conferir perfil legado, skill de projeto que substitui a distribuída, referência ausente, ordenação persistida, tamanho do prompt e igualdade entre prévia e execução.

Saída com busca funcional e perfil executável pelo caminho normal do desktop. A ajuda desses fluxos é entregue junto. Capturar a tela com dados de teste.

## P2 — Operações de instalação e diagnóstico

Dependência de P0. Revisar o configurador compartilhado R2 e preservar o comportamento das receitas. Introduzir operação persistente, eventos por etapa e reconciliação. Centralizar chamadas de proposta e aplicação usadas pelo desktop e MCP. Proteger confirmação concorrente. Persistir diagnóstico com data, revisão e latência.

Aceites IN-01 a IN-06. Cobrir falha depois de instalar, teste de conexão repetido, revisão obsoleta, interrupção de processo, journal que falha depois da aplicação e instalação concorrente. Definir remoção ou compensação por recurso pertencente à operação. Uma verificação de protocolo não comprova carregamento dos hooks dentro de um host.

Saída com progresso real de uma receita e recuperação reproduzível em fixture. Documentar as receitas já cobertas e os ensaios de host ainda necessários.

## P3 — Pendências e retomada

Dependências de P2 para pendências de instalação e da base Flow existente. Concluir FDR-007 com o SDD original como referência. Ligar IPC, ordem de eventos, estado busy e revisão recuperada. Projetar pendências a partir das fontes do runtime e conectar ações.

Aceites PE-01 a PE-03. Cobrir open seguido de evento de revisão, troca rápida de projeto, retomada sem duplicação, run ainda ativo, diff alterado e Flow encerrado. Filtrar pendências não altera as entidades.

Saída com reabertura de uma revisão e retomada explícita pela janela. Registrar como lidar com estado incerto após crash.

## P4 — Memória e contexto de tarefa

Dependências de P1 e P3 para composição e snapshots. Construir domínio persistente, operações versionadas, scopes, UI de registro, edição e exclusão, seleção no compositor e resolução compartilhada. Integrar MCP conforme o contrato aprovado no SDD.

Aceites ME-01 a ME-05. Cobrir isolamento de projetos, escopo de usuário escolhido, concorrência de edição, memória excluída, run já iniciado e excesso de contexto. Registrar a regra de retenção do texto incluído no journal. Preservar a revisão da seleção até iniciar.

Saída com um registro criado, selecionado, usado na execução e recuperado no histórico com sua versão original.

## P5 — Mapa de código e diff

Dependência de P2 e de versão funcional do Graphify. Inspecionar um artefato real da versão suportada, definir adapter, carga limitada, mapa, lista, detalhe e ação de atualização. Relacionar arquivos do diff ao grafo, incluindo renomes e paths do Windows.

Aceites MP-01 a MP-04. Cobrir grafo ausente, inválido, grande e desatualizado, último snapshot válido e abertura de arquivo fora da pasta permitida. Manter o DAG do Flow com seu contrato existente.

Saída com um módulo selecionado na lista e mapa, atualização observável e relação real com uma mudança de arquivo. Se Graphify não puder ser executado no ambiente, preservar fixture representativa e registrar o teste real pendente com motivo.

## P6 — Custos por atribuição

Dependências de P1, P2 e metadados de run disponíveis. Definir origem dos IDs e semântica de integração participante. Registrar os metadados no início e agregar mantendo o consumo existente. Acrescentar os filtros, agrupamentos e detalhe de execução.

Aceites CU-01 a CU-04. Cobrir histórico legado, valor ausente, zero reportado, parcial, preço estimado, eventos cumulativos e múltiplas integrações sem duplicar total. Usar o mesmo período em todas as visualizações.

Saída com o total da seleção conciliado com os runs de origem. Executar navegação do gráfico até uma tarefa pela janela.

## P7 — Ajuda e aceite completo

Dependência das fases anteriores. Consolidar ajuda já entregue em cada fluxo, revisar links e erros, medir comportamento em janela pequena e teclado. Executar build, typecheck, testes necessários e smoke do Electron. Registrar hosts e versões testados e pendências reais.

Aceites AJ-01 a AJ-03 e estados comuns. Conferir navegação, orçamento de contexto, projeto ativo, filtros e recuperação de erro. Capturar screenshots reais do que foi implementado. Atualizar o README com capacidades e imagens entregues quando essa publicação fizer parte da autorização vigente.

Saída com checklist final, evidências, limitações, checkpoint e handoff. O material de proposta permanece em docs/desktop-product-evolution.

## Retomada com limite de contexto

O Claude mantém CHECKPOINT.md com commit observado, branch, alterações locais relevantes, última tarefa concluída, tarefa em andamento, arquivos tocados, decisões, comandos com resultado e próxima ação exata. Não copiar credenciais nem logs sensíveis.

Atualizar o checkpoint ao concluir uma subtarefa. Se a sessão terminar durante uma operação, o registro anterior permite reconhecer a operação e verificar seu estado. Na retomada, checar git diff e efeitos reais antes de executar novamente. Um resumo do chat é auxiliar, e os arquivos constituem a referência durável.

## Verificação local

A base inicial de 20/11 passou em 849 testes com um registro temporário em 20/11. O comando a seguir evita modificar o registro pessoal de projetos durante os testes.

```sh
validation_dir=$(mktemp -d /tmp/gatewright-validation-XXXXXX)
GATEWRIGHT_PROJECTS="$validation_dir/projects.json" npm run check
```

No Windows, criar a pasta temporária pelo Node e passar a variável ao processo de teste de forma compatível com o shell utilizado. O comando do aplicativo continua sendo `npm run desktop:dev -- "caminho/do/projeto"`. O smoke é `npm run test:desktop` em sessão gráfica. Falhas de permissão ou falta de um serviço exigem registrar a limitação sem alterar o sandbox de produção para obter um resultado artificialmente verde.
