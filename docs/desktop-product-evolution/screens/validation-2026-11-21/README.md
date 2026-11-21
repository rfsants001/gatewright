# Aceite do desktop em 21/11/2026

A continuação após main 1ac6388 concluiu P2-004b e P4–P7. Os testes usam projetos descartáveis. Capturas são da janela real, com conteúdo de demonstração declarado — sem contas externas, credenciais ou gastos reais.

## Ambiente e resultados

| Verificação | Resultado |
| --- | --- |
| Node / Electron / SO | Node 24.16.0 · Electron 45.3.1 · Linux com sessão gráfica |
| Typecheck, build e suíte | `npm run check` com GATEWRIGHT_PROJECTS/GATEWRIGHT_HOME temporários; **961 testes / 127 arquivos passaram** |
| Inicialização | `npm run test:desktop` passou com caminho contendo espaços |
| Pendências / Flow | `npm run test:desktop:pending` passou; revisão vencida rejeitada, decisão atual aplicada, diagnóstico correto, reinícios com ask/run recuperados sem execução automática |
| Evolução integrada | `npm run test:desktop:evolution` passou; memória criada pela UI, agente e memória recebidos pelo provedor HTTP local, snapshot preservado após editar e reiniciar, custo → contexto → tarefa, mapa/lista/diff, contenção de arquivo e remoção de recurso pertencente |
| Acessibilidade / tamanho | Sem overflow horizontal global; scroll vertical alcança o fim; 1440×960, 1120×860, 780×580; dialog contém foco, fecha com Escape e retorna ao acionador |
| Memória concorrente | Quatro processos disputam a mesma revisão: exatamente um salva, outros recebem conflito |
| Graphify real | Python 3.14.4 + graphifyy[mcp] 0.9.114 instalado em /tmp; applyIntegration → inspectOperation (versão e registro verificados) → cleanup; generateCodeMap executou o extrator real sem LLM |

A suíte também cobre isolamento A/B e pessoal, recipients, escopo de tarefa, tombstone, teto UTF-8, MCP de memória, cumulativo de uso, legado, rateio de integrações, schema/limites/cache de mapa, paths Windows, symlink, Git e rename. O teste Ink de Flow agora aguarda a montagem da pergunta com o atalho de leitura `a`, que não aprova decisões; elimina perda de input causada por assinatura de efeito ainda não montada sob carga.

## Repetir

Da raiz do checkout, em sessão gráfica:

```sh
npm run check
npm run test:desktop
npm run test:desktop:pending
npm run test:desktop:evolution
```

Para guardar screenshots:

```sh
node desktop/pending-smoke.mjs docs/desktop-product-evolution/screens/validation-2026-11-21
node desktop/evolution-smoke.mjs docs/desktop-product-evolution/screens/validation-2026-11-21/evolution
```

Os smokes criam perfis e registro de projetos temporários, usam diagnóstico local em porta aleatória e removem processos e projetos ao terminar. A porta e os diretórios não são parte da configuração de produção. O CI executa os workflows novos no Linux/Xvfb e a inicialização também em macOS/Windows.

## Conteúdo das capturas

`pending-overview.png` e `pending-electron.png` mostram pendências reais derivadas de journals de fixture. `evolution/` contém Project, Tasks, Costs, Integrations, Agents, Skills, Memory e Map. Os banners WebP atuais do README usam essas capturas.

O provedor local retorna uma resposta fixa com tokens de teste. O modelo sem preço conserva custo desconhecido. Há seis journals históricos com valores declarados de fixture para exercitar os gráficos preenchidos e a convivência com custo parcial. O mapa da UI é uma fixture representativa; a fixture produzida pelo Graphify real e seus comandos estão em src/core/codemap/fixtures/README.md. Nenhum valor representa fatura ou conta autenticada.

## Limites

Os fluxos novos foram validados localmente no Linux. Não houve execução autenticada em Claude Code, Codex, Gemini CLI ou OpenCode, nem uma cobrança real de provedor/proxy ou teste de Docker neste ambiente. Esses contratos têm testes automatizados, e o ensaio de cada serviço autenticado depende do ambiente. Não declarar essas condições como aprovadas.

P2-004b foi implementada e o Graphify foi instalado/removido de verdade. Operações antigas sem ownership não são removidas automaticamente. Um lock abandonado antes de gravar owner.json exige conferência manual. A recuperação consulta recursos e nunca repete a instalação; remoção requer revisão atual e prova de propriedade. Custos de integração são rateio de contexto habilitado, não uso de ferramenta observado ou tarifa de SaaS.
