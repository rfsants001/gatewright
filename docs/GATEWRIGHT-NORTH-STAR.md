# Gatewright — North Star

> **Atualização de 13/11/2026.** Gatewright é um orquestrador local multi-host com desktop Linux como interface principal do piloto. A TUI continua disponível durante a transição. O harness Node/TypeScript e MCP stdio funcionam sem a janela. A referência operacional é [Gatewright Desktop](DESKTOP.md).
>
## Direção aprovada — desktop local e terminal conectado

Configure o projeto uma vez e leve skills e políticas para os hosts que você já usa. O desktop concentra execução, revisão, consumo e configuração. O terminal continua sendo uma superfície de trabalho, com MCP e hooks nas integrações que os suportam. Assinaturas ficam no login oficial do host. APIs externas, proxies e modelos locais entram por perfis de endpoint e referências de credencial. A configuração pode ser solicitada em linguagem natural, com proposta tipada, preview, aprovação e aplicação auditável como objetivo.


## Histórico de planejamento — 28/10/2026

> O documento canônico de direção do Gatewright. Redefine o produto a partir das conversas
> de 28/10/2026 (dossiê + parecer da IA avaliadora + visão do Rafael). Substitui o
> enquadramento "guardrails para agentes" por um enquadramento maior e com fio condutor
> único. Toda decisão de escopo daqui pra frente se mede contra este documento.
>
> Companheiros: `GATEWRIGHT-DOSSIE.md` (o que existe) · `GATEWRIGHT-ANALISE-TERMINAL-VS-WEB.md`
> (parecer externo, cujo risco nº1 — dispersão — este doc endereça de propósito).

---

## 1. Em uma frase

**Gatewright é um gerenciador geral de IA — modelos, skills, plugins, commands, budget,
configuração e instalação centralizados num só ponto — que qualquer ferramenta externa
consome via MCP. Você configura uma vez; reusa em todo lugar; e liga ou desliga cada peça,
incluindo a nossa, trocando por externas quando quiser.**

Guardrails/governança é **uma feature** desse gerenciador, não o título.

---

## 2. A referência (HubStack) e onde divergimos

O HubStack já faz duas coisas que nos inspiram:

1. **MCP de fora** — pode ser consumido por aplicações externas via MCP.
2. **Flow de dentro** — monta um fluxo completo usando uma engine de IA.

O Gatewright faz **as duas** — e adiciona o que o HubStack não faz:

> **Trabalhar com ferramentas externas de forma plugável.** O gate não é um silo: ele
> integra, gerencia e orquestra ferramentas de terceiros (modelos, advisors, savers de token,
> MCPs, provedores), e cada uma pode ser **ativada ou desativada**. Se você não quer o nosso
> Jev e prefere um advisor externo, o gate **configura essa troca sozinho, usando IA.**

Diferencial em uma linha: **HubStack é um ambiente fechado que faz MCP+flow; o Gatewright é
um hub aberto e flexível que faz MCP+flow E gerencia qualquer ferramenta externa, ligável à
vontade.** Tudo clean-room: conceito/arquitetura, zero código ou marca de terceiros.

---

## 3. O que o Gatewright é: gerenciador geral + MCP

O gate é responsável por gerenciar, para todos os modelos e ferramentas num só ponto:

- **Consumo** — tokens e custo por modelo, por run, por ferramenta.
- **Utilização** — qual modelo faz o quê, como cada um trabalha, roteamento por custo/complexidade.
- **Budget** — tetos, degradação, kill-switch, ladder de autonomia.
- **Configuração** — modelos, chaves, políticas, skills, commands, plugins — definidos uma vez.
- **Instalação/provisionamento** — instala e fia as dependências sozinho (modelos locais, savers, MCPs, pacotes).

Organizado em **três planos** sobre um núcleo único de governança:

| Plano | O que é | Estado |
|---|---|---|
| **Configuração** | Modelos, roteamento, skills, commands, plugins, savers — definidos uma vez, resolvidos por escopo (gate/projeto). | Parcial (config 2 níveis + skills + provisioner existem) |
| **Governança** | Gates, budget, auditoria, journal, aprovação humana. | Maduro (é o que o dossiê descreve) |
| **Interoperabilidade** | O gate como servidor MCP rico que qualquer cliente externo consome. | **Lacuna principal** (ver §4) |

E cortando os três: **observabilidade** — ver consumo, modelos usados, e *como a arquitetura
está sendo desenhada/executada* (grafo do run, DAG do plano, fases).

---

## 4. A inversão MCP (gate como provedor) — a peça que falta

Hoje o gate é um **driver de saída**: `gate → spawna claude -p`. Puxa a engine pra dentro.
Isso cobre o "flow de dentro" (item 2 da §2) e já funciona.

A visão exige o **inverso**, que hoje quase não existe: o gate como **provedor de entrada**.
Um Claude Code, Cursor ou app qualquer rodando por fora → aponta pro MCP do gate → **herda
tudo o que foi construído dentro**: skills, commands, governança, roteamento de modelo,
budget, contabilidade de token.

```
Hoje:    gate ──spawn──► claude -p                 (driver; 1 direção; flow de dentro)
Norte:   claude / cursor / app ──MCP──► gate       (hub; qualquer cliente; consumo de fora)
                                          │
                 skills · commands · gates · routing · budget · usage · arquitetura
```

Por que MCP é o caminho certo (e não um adapter por host): cada ferramenta tem seu próprio
mecanismo de extensão, mas **todas falam MCP**. É o único denominador comum — o que torna
"reusar skills/plugins/commands em todos os modelos possíveis" tecnicamente viável.

O protocolo MCP já tem os canais; o gate precisa deixar de expor só 4 tools pobres
(`list_gates`/`check_gate`/`configure_jev`/`get_jev_config`) e passar a expor:

| Ativo do gate | Canal MCP | Resultado no cliente externo |
|---|---|---|
| Skills (playbooks) | **prompts** | O Claude Code de fora lista e invoca as skills do gate. |
| Commands / fluxos | **prompts** | Comandos do gate viram comandos do cliente. |
| Config, modelos, usage, budget, grafo da arquitetura | **resources** | O cliente lê o estado do hub. |
| Roteamento, checagem de gate, provisionamento, troca de ferramenta | **tools** | O cliente aciona o hub. |

> **Nota de precisão (correção do dossiê):** a *imposição* de governança nos runs que o gate
> dirige acontece pelos **hooks** do host (`PreToolUse`/`PostToolUse`/`Stop`/`SubagentStop`),
> não pelo MCP. O MCP é a superfície de **consumo** (inbound). São dois mecanismos
> complementares: hooks = enforcement de dentro; MCP = provisão pra fora. Não confundir.

---

## 5. Flexibilidade: tudo é plugável, toggleável e configurável por IA

Princípio: **nenhuma peça nossa é obrigatória.** Jev, savers, modelos, advisors, MCPs — cada
um é um módulo com estado `ativo/inativo` e um provedor que pode ser o nosso **ou externo**.

**Exemplo canônico (dado pelo Rafael):** o usuário não quer o nosso Jev e prefere um advisor
externo. O gate não precisa de um adapter pré-compilado pra esse advisor específico — ele
**usa a própria IA pra configurar a troca**: lê o que o advisor externo expõe, escreve a
config, fia no fluxo, verifica. Liga o externo, desliga o nosso.

Isso exige um tipo de ativo que o catálogo público de skills **não** mostra:

- **Skills públicas** — playbooks reutilizáveis de dev (code-review, sdd, refactor…). Aparecem no catálogo, são injetadas nos runs do usuário.
- **Skills internas (de sistema)** — capacidades do *próprio gate*, **não aparecem pro usuário**. São usadas pela IA do gate pra **configurar, instalar e fiar qualquer coisa externa**: trocar o advisor, plugar um MCP novo, integrar um saver, configurar um provedor de modelo. Junto com **prompts** e **commands** internos, formam o "sistema operacional de configuração" do gate.

Isso generaliza um padrão que já existe (a skill `gate-package-installer`: cola a URL do repo
→ a engine instala sozinha). A visão é **estender esse padrão a toda integração externa**:
configuração como tarefa de IA guiada por skill interna, não como adapter hardcoded. É o que
torna o gate **flexível de verdade** — ele integra ferramentas que ninguém pré-programou.

---

## 6. O princípio organizador (como isto NÃO vira dispersão)

O parecer externo apontou o risco nº1 corretamente: **dispersão** — governança + roteador +
hub de skills + economia de token + observabilidade parece 6 produtos.

A resposta é o fio condutor único deste documento:

> **Tudo o que o gate faz existe para "configurar uma vez, reusar em todo lugar, via MCP,
> ligável à vontade". O que não serve a isso, não entra.**

Com esse critério, as fases espalhadas deixam de ser grab-bag e viram uma linha só. O que
**corta ou adia:** qualquer coisa que não melhore centralização, reuso, interop ou
flexibilidade — SaaS, times, billing, colaboração remota (só sob demanda comprovada).

O que **continua valendo do parecer:** provar o núcleo com uma pessoa de fora **antes** de
construir os três planos inteiros. O MVP (§8) é pequeno e falsificável de propósito.

---

## 7. Re-ancoragem do roadmap sob o novo norte

As fases 18–28 já existem como "gap do HubStack". Sob o North Star, elas **são o produto** —
só precisam ser relidas pela lente dos três planos:

| Fase existente | Plano | Papel no North Star |
|---|---|---|
| F27/F17 **SmartRouter** | Config/Utilização | Centralizar modelos + organizar como cada um trabalha. **Promover de "em estudo" a espinha.** |
| F28 **Savers** (RTK/Headroom/…) | Config/Instalação | Economia de token, auto-instalada. |
| F20 **Observabilidade** + F23 **Run Detail** | Observabilidade | Ver consumo, modelos, e a arquitetura sendo executada. |
| F19 **Budget + Ladder** | Governança/Budget | Gestão de consumo como cidadão de 1ª classe. |
| F18 **5 travas OWASP** | Governança | Segurança determinística. |
| F22 **Artifact/Decision/Research** | Governança | Auditoria com SHA-256. |
| F24–26 **Skills batches** | Config | Mais ativos reusáveis. |
| Skills manager + provisioner (feito) | Config/Instalação | Base do plano de configuração. |
| **(novo) Inversão MCP** | Interoperabilidade | §4 — o gate como provedor consumível. **Não está no roadmap atual.** |
| **(novo) Skills internas de config-por-IA** | Config/Flexibilidade | §5 — flexibilidade plugável. **Generaliza o `gate-package-installer`.** |

Dois itens genuinamente novos (inversão MCP + config-por-IA). O resto é re-rotulagem.

---

## 8. MVP — o que provar primeiro

Sequência falsificável, do parecer + do norte. Cada etapa tem critério de desligamento.

**Etapa 0 — Release hygiene (pré-requisito de tudo).**
LICENSE MIT · sair de `private`/`0.0.0` · CI (typecheck/test/build) · pacote instalável ·
caminho mínimo sem Jev.
*Saída:* alguém de fora instala, roda uma tarefa protegida e entende uma recusa sem o autor.

**Etapa 1 — A inversão MCP, mínima.**
O gate expõe via MCP: (a) as skills como **prompts**; (b) um **resource** de usage/consumo.
Um **Claude Code externo** (rodando normal, fora do gate) consome e usa uma skill do gate.
*Saída:* dá pra usar o Claude Code por fora herdando pelo menos uma skill + ver o consumo —
sem perder o que está no gate. Se isso não funcionar/não for útil, a visão de hub cai.

**Etapa 2 — Config-por-IA, mínima.**
Uma skill interna que troca um módulo plugável usando a IA. Caso-teste: **desligar o Jev e
plugar um advisor externo**, com o gate escrevendo e verificando a config sozinho.
*Saída:* trocar uma peça nossa por uma externa sem adapter hardcoded, só com skill interna.

**Etapa 3 — SmartRouter mínimo + usage real.**
Roteamento de ao menos 2 modelos por política de custo/complexidade, com consumo medido e
exposto no resource MCP da Etapa 1.
*Saída:* "centralizar modelos e organizar como cada um trabalha" vira comportamento real.

Fora do MVP: observabilidade completa (5 abas), marketplace, times, billing, web completa.

---

## 9. Terminal vs web sob o novo norte

A pergunta se dissolve. Se o produto é um **control plane consumido via MCP**, então:

- **MCP é a interface primária de uso** — consumida por qualquer ferramenta que o dev já tem.
- **CLI/TUI** = painel de **administração** do hub (configurar, governar, automatizar, headless/SSH/CI).
- **Web local** = dashboard de **observabilidade** (consumo, modelos, arquitetura executada) — exatamente o que o parecer recomendou validar, e o que o Rafael pediu ("ver como a arquitetura está sendo executada"). Experimento com critério de desligamento, não pivô.

Terminal e web param de competir: **terminal = admin, web = observar, MCP = o produto.**

---

## 10. O fosso (moat)

Num mundo onde Claude Code e Codex vão ganhar guardrails nativos, o diferencial defensável
**não** é quantidade de telas, skills ou estruturas de dados. É:

1. **Portabilidade comprovada entre hosts** — configure uma vez, reuse em qualquer cliente MCP.
2. **Flexibilidade plugável com config-por-IA** — integra e troca ferramentas externas sem adapter pré-programado. Nenhuma peça nossa é obrigatória.
3. **Controle reproduzível e explicável** — governança determinística + journal auditável.

Os três juntos são difíceis de copiar e não dependem de nenhum host específico. É o que o
Gatewright pode ser que o guardrail nativo de um host, por definição, não é: **o ponto
neutro, central e flexível entre todas as IAs e todas as ferramentas.**

---

*Norte definido 2026-10-28. Próxima revisão: após a Etapa 1 do MVP (inversão MCP).*
