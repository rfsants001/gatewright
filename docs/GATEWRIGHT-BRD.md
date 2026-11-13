# Gatewright — BRD (Business Requirements Document)

> **Atualização de 13/11/2026.** Gatewright é um orquestrador local multi-host com desktop Linux como interface principal do piloto. A TUI continua disponível durante a transição. O harness Node/TypeScript e MCP stdio funcionam sem a janela. A referência operacional é [Gatewright Desktop](DESKTOP.md).
>
## Proposta atual

O público inicial é o dev que alterna entre agentes e provedores e quer reduzir setup repetido, entender o consumo e revisar ações a partir de um projeto. Sucesso significa abrir o mesmo repo no desktop e em hosts suportados, reaproveitar uma skill, identificar a proteção disponível e verificar o resultado de uma execução. Assinaturas, créditos e faturamento ficam sob o contrato do provedor. Validar separadamente adoção, retenção, tempo até o primeiro valor e portabilidade.


## Histórico de planejamento — 28/10/2026

> Documento de requisitos de **negócio**. Responde ao *por quê* e ao *para quem vale a pena*.
> Ancorado no `GATEWRIGHT-NORTH-STAR.md`. Pareiros: `GATEWRIGHT-PRD.md` (o quê),
> `GATEWRIGHT-TRD.md` (o como).
>
> - **Versão:** 0.1 (draft) · **Data:** 2026-10-28 · **Owner:** Rafael
> - **Estágio:** alpha, pré-lançamento, pré-validação externa.
> - **Confiança:** baixa em dados de mercado/demanda (nenhum usuário externo ainda); alta na clareza do problema.

---

## 1. Contexto de negócio

O uso de agentes de IA de código (Claude Code, Codex, Cursor, etc.) explodiu, mas cada
ferramenta é um **silo**: skills, comandos, configuração de modelo, políticas e histórico
não se transferem entre elas. Quem usa mais de uma IA reconstrói tudo em cada uma, não tem
visão unificada de consumo/custo, e não consegue impor as mesmas regras em todas.

O Gatewright se posiciona como o **ponto neutro e central entre todas as IAs e ferramentas**:
um gerenciador geral (modelos, skills, plugins, commands, budget, configuração, instalação)
consumível por qualquer cliente via MCP, com governança e observabilidade embutidas.

## 2. Problema de negócio

| # | Dor | Quem sente | Custo hoje |
|---|---|---|---|
| B1 | Configuração/skills/comandos presos a cada host | Dev que usa >1 IA | Retrabalho; conhecimento não reusável |
| B2 | Sem visão unificada de consumo de token/custo por modelo | Dev e, sobretudo, time | Fatura imprevisível; sem controle de budget |
| B3 | Regras de trabalho com IA vivem na cabeça de uma pessoa | Time | Não escala, não é repetível, não é auditável |
| B4 | Trocar/integrar ferramenta externa exige trabalho manual por integração | Dev avançado | Lock-in de fato; fricção alta |
| B5 | Nenhuma camada **open-source, portável e versionada** que una isso | Mercado | Lacuna de categoria |

## 3. Objetivos de negócio

- **BO-1 — Criar categoria:** ser reconhecido como o "AI control plane" open-source, portável entre hosts via MCP.
- **BO-2 — Adoção por dev individual primeiro:** caminho de instalação de baixa fricção; valor em minutos, sem depender de time.
- **BO-3 — Reuso comprovado entre hosts:** o mesmo conjunto de skills/config/governança usado em ≥2 clientes distintos via MCP.
- **BO-4 — Flexibilidade como diferencial:** nenhuma peça nossa obrigatória; integrar/trocar ferramentas externas com esforço mínimo (config-por-IA).
- **BO-5 — Base para sustentação futura:** núcleo MIT aberto; caminho open-core avaliado **só** após demanda comprovada.

## 4. Stakeholders

| Stakeholder | Interesse |
|---|---|
| **Rafael** (owner/autor) | Formalizar o modo-tutor/SDD como produto; dogfooding; portfólio open-source. |
| **Dev individual** (usuário-alvo primário) | Reusar skills/config entre IAs; economizar token; controlar o agente. |
| **Time de dev** (usuário-alvo secundário, futuro) | Governança compartilhada, versionada, auditável; visão de custo. |
| **Comunidade open-source** | Projeto MIT extensível; contribuições de skills/adapters. |
| **Mantenedores de hosts (Claude/OpenAI/Cursor)** | Ecossistema MCP; Gatewright é consumidor/complemento, não concorrente de host. |

## 5. Oportunidade e posicionamento

- **Categoria análoga emergente:** "AI gateway"/"LLM gateway" (ex. roteadores de modelo). O Gatewright difere por juntar **gateway + reuso de skills/commands + governança versionada no repo + consumo via MCP**, não só roteamento de requisição.
- **Posicionamento:** *"Configure sua IA uma vez. Use em qualquer ferramenta. Com governança e custo sob controle."*
- **Não-concorrência com hosts:** quando Claude Code/Codex ganharem guardrails nativos, eles valem **só dentro do próprio host**. O fosso do Gatewright é ser **neutro, portável e flexível** entre todos — algo que um guardrail nativo, por definição, não é.

## 6. Escopo de negócio

**Dentro (agora):**
- Produto open-source MIT, auto-hospedado/local, uso individual.
- Suporte a hosts que falam MCP; foco inicial Claude Code (adapter maduro).
- Monetização = **nenhuma ainda** (validação de valor primeiro).

**Fora (agora, reavaliar sob demanda):**
- SaaS com execução hospedada; colaboração multiusuário; billing; "governança empresarial" como pitch.
- Qualquer feature que não sirva ao critério North Star (*configurar-uma-vez-reusar-via-MCP-ligável*).

## 7. Métricas de sucesso de negócio (KPIs)

> Alvos são hipóteses de alpha, não compromissos. Reavaliar após primeiro piloto (5–10 externos).

| KPI | O que mede | Sinal de sucesso (hipótese) |
|---|---|---|
| **TTFV** (time-to-first-value) | Tempo da instalação até primeira tarefa protegida | < 15 min, sem ajuda do autor |
| **Reuso entre hosts** | nº de clientes MCP distintos que consomem o mesmo setup | ≥ 2 |
| **Retenção leve** | usuários que voltam após ~2 semanas em novo projeto | sinal qualitativo positivo no piloto |
| **Economia de token** | tokens evitados via savers/routing | mensurável e exibido; > 0 com sentido |
| **Taxa de bloqueio útil vs ruído** | violações reais barradas vs falsos positivos | falsos positivos baixos o bastante pra não desligarem |
| **Sustentabilidade de manutenção** | esforço por superfície (CLI/TUI/web) | não crescer mais rápido que o valor entregue |

## 8. Modelo de sustentação (hipóteses, não decisões)

Sequência: **OSS puro → OSS + serviços → open-core**, só avançando com evidência.

| Hipótese | Condição para considerar |
|---|---|
| Doações/patrocínio OSS | Adoção orgânica relevante |
| Suporte/implantação assistida | Times pedindo ajuda de setup |
| Serviços de colaboração (open-core pago) | Demanda **comprovada** de aprovação multiusuário/acesso remoto |

> "Governança empresarial" **não** é demanda comprovada só porque o produto tem logs e aprovações (crítica aceita do parecer externo).

## 9. Riscos de negócio

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Dispersão** (muitos produtos num alpha) | Alta | Alto | Critério North Star de corte; MVP falsificável em 4 etapas |
| **Demanda não comprovada** | Alta | Alto | Piloto com externos antes de expandir planos |
| **Hosts absorvem o valor nativamente** | Média | Alto | Apostar em neutralidade/portabilidade/flexibilidade (o que host não faz) |
| **Fricção de onboarding** (precisa instalar componente local) | Média | Médio | Etapa 0 release hygiene; caminho mínimo sem Jev |
| **Clean-room/legal (HubStack)** | Baixa | Alto | Zero código/marca de terceiros; só conceito/arquitetura |
| **Bus factor (autor único)** | Alta | Médio | Docs canônicos; OSS para atrair contribuição |

## 10. Premissas e restrições

- **Premissa:** o MCP é/continuará sendo o denominador comum entre hosts de IA.
- **Premissa:** devs que usam >1 IA sentem a dor de silos o suficiente para instalar um hub.
- **Restrição:** stack TS/Node, MIT, headless-first, sem Electron; clean-room do HubStack.
- **Restrição:** execução permanece **local** no MVP (sem nuvem); privacidade local-first como valor.

## 11. Critérios de Go / No-Go (gate de negócio)

- **Go para expandir os 3 planos** se, no piloto: TTFV < 15min, reuso entre ≥2 hosts funciona, e bloqueios são úteis sem ruído excessivo.
- **No-Go / repensar** se ninguém além do autor instala e extrai valor, ou se o valor é indistinguível de um guardrail nativo de host.
- **Objetivo pessoal como piso:** mesmo sem adoção externa, o Gatewright se paga como ferramenta do próprio Rafael (dogfooding). Nesse cenário, web/colaboração podem nunca compensar — e tudo bem.
