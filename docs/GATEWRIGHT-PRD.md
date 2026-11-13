# Gatewright — PRD (Product Requirements Document)

> **Atualização de 13/11/2026.** Gatewright é um orquestrador local multi-host com desktop Linux como interface principal do piloto. A TUI continua disponível durante a transição. O harness Node/TypeScript e MCP stdio funcionam sem a janela. A referência operacional é [Gatewright Desktop](DESKTOP.md).
>
## Requisitos do piloto desktop

| ID | Requisito | Aceite |
| --- | --- | --- |
| D1 | Abrir, localizar e vincular projetos | Pasta canônica, recentes e escopo explícito antes de mudar configurações. |
| D2 | Detectar e conectar hosts | Preview e revisão da configuração. Validar conexão, skills e hooks separadamente por host e versão. |
| D3 | Rodar com CLI, API, proxy ou Ollama | Autenticação oficial do host ou referência de credencial. Erro, cancelamento e sucesso têm estados próprios. |
| D4 | Orquestrar e revisar | Aprovação referenciada pelo snapshot; falha bloqueia a próxima etapa; arquivos e diff visíveis. |
| D5 | Exibir consumo | Tokens registrados, custo observado ou estimado e dados indisponíveis diferenciados. |
| D6 | Configurar por IA | Propostas de provedor, projeto, skill e MCP com preview. Expandir para plugins executáveis, política, workflows e reversão rastreável. |
| D7 | Interface de ferramenta de trabalho | Vocabulário de tarefa, rótulos acessíveis, foco previsível, contraste e feedback sem depender de cor. |


## Histórico de planejamento — 28/10/2026

> Documento de requisitos de **produto**. Responde ao *o quê* e *para quem*. Ancorado no
> `GATEWRIGHT-NORTH-STAR.md`. Pareiros: `GATEWRIGHT-BRD.md` (porquê de negócio),
> `GATEWRIGHT-TRD.md` (como técnico).
>
> - **Versão:** 0.1 (draft) · **Data:** 2026-10-28 · **Owner:** Rafael
> - Prioridades em **MoSCoW** (Must / Should / Could / Won't-now).

---

## 1. Visão do produto

> **Gatewright é um gerenciador geral de IA + MCP.** Você configura modelos, skills, plugins,
> commands, budget e políticas **uma vez**, e qualquer ferramenta externa consome via MCP.
> Cada peça é ligável/desligável — inclusive as nossas, trocáveis por externas, configuradas
> pela própria IA. Governança, economia de token e observabilidade vêm embutidas.

Três planos sobre um núcleo de governança, cortados por observabilidade:
**Configuração · Governança · Interoperabilidade (MCP) · [Observabilidade]**.

## 2. Personas

| Persona | Perfil | Dor principal | O que espera |
|---|---|---|---|
| **Dani, dev poliglota de IA** (primária) | Usa Claude Code + Cursor + modelo local | Reconfigura tudo em cada ferramenta; custo cego | Configurar uma vez, reusar em todas; ver consumo |
| **Rafael, owner/power-user** | Constrói e dogfood o gate | Modo-tutor/SDD não é reusável como produto | Fluxo SDD governado; o gate governando a si mesmo |
| **Téo, tech lead** (secundária, futuro) | Quer regras iguais para o time | Regras na cabeça de 1 pessoa; sem auditoria | Políticas versionadas, auditáveis, compartilháveis |
| **Léo, revisor menos técnico** (futuro) | Aprova planos/diffs | TUI pressupõe familiaridade com terminal | Revisão/aprovação visual (web local) |

## 3. Objetivos e não-objetivos do produto

**Objetivos:**
- PO-1 Centralizar modelos e organizar como cada um trabalha (roteamento).
- PO-2 Reusar skills/commands/plugins em qualquer host via MCP.
- PO-3 Governar o agente (gates) de forma determinística e auditável.
- PO-4 Gerenciar budget/consumo e economizar token.
- PO-5 Ser consumível por apps externos via MCP (inversão).
- PO-6 Integrar/trocar ferramentas externas de forma plugável, configurada por IA.
- PO-7 Observar consumo, modelos e arquitetura executada.

**Não-objetivos (agora):** SaaS/execução hospedada; colaboração multiusuário; billing; editor completo na web; acoplamento a editor específico.

## 4. Jornadas de usuário

### J1 — Setup (uma vez por projeto/máquina)
Instalar → `gate init` detecta hosts/modelos e escreve configs → escolher skills/gates → configurar roteamento e budget → `gate serve` expõe o MCP.

### J2 — Usar a IA por dentro do gate (flow)
Abrir o cockpit → escrever objetivo → gate dirige a engine headless (run) → gates+Jev disparam via hooks → checkpoints `<gate-ask>` para o humano → review → aprovação → PR.

### J3 — Usar a IA por fora herdando o gate (inversão MCP) ★ nova
Rodar Claude Code/Cursor normal → apontar pro MCP do gate → cliente externo **lista e usa as skills/commands do gate**, lê consumo, aciona roteamento/governança — **sem perder o que foi construído no gate**.

### J4 — Trocar uma ferramenta por externa ★ nova
Usuário desliga o Jev e indica um advisor externo → o gate usa a própria IA (skill interna) para ler, configurar, fiar e verificar a troca → liga o externo.

### J5 — Observar
Ver, em painel, consumo/custo por modelo, runs ao vivo, e o grafo da arquitetura sendo executada.

## 5. Requisitos funcionais

### 5.1 Plano de Configuração
| ID | Requisito | Prioridade | Estado |
|---|---|---|---|
| RF-C1 | Config resolvida por escopo (gate global vs projeto) | Must | Feito |
| RF-C2 | Catálogo de skills + instalar + `skill new` (scaffold) | Must | Feito |
| RF-C3 | Registro de modelos/provedores (local Ollama + hosts) | Must | Parcial |
| RF-C4 | Provisionamento automático (instala Ollama/savers/pacotes) | Should | Parcial |
| RF-C5 | Commands e plugins como ativos de 1ª classe (def. uma vez) | Should | Parcial |
| RF-C6 | Toggle enable/disable por peça (Jev, savers, modelos, MCPs) | Must | Parcial |

### 5.2 Plano de Governança
| ID | Requisito | Prioridade | Estado |
|---|---|---|---|
| RF-G1 | 7 gates por evento (secret/plan/verify/error/proportion/completion/quality) | Must | Feito |
| RF-G2 | Fail-open por padrão; fail-closed só em plan/scope | Must | Feito |
| RF-G3 | Jev advisory-only (local-first, budget-aware) | Should | Feito |
| RF-G4 | Journal append-only auditável + replay | Must | Feito |
| RF-G5 | Aprovação humana com evidência antes de gate/ask | Must | Feito |
| RF-G6 | Budget guard + ladder de autonomia L0–L3 | Should | Planejado (F19) |
| RF-G7 | 5 travas OWASP + anti-evasão + git hooks | Could | Planejado (F18) |
| RF-G8 | Comportamento por gate em timeout/payload inválido/falha explícito | Must | **Gap (parecer 8.2)** |

### 5.3 Plano de Interoperabilidade (MCP) ★ foco
| ID | Requisito | Prioridade | Estado |
|---|---|---|---|
| RF-I1 | Expor skills como **prompts** MCP | Must | **Novo (MVP E1)** |
| RF-I2 | Expor config/usage/grafo como **resources** MCP | Must | **Novo (MVP E1)** |
| RF-I3 | Expor roteamento/governança/provisionamento como **tools** MCP | Should | Novo |
| RF-I4 | Cliente externo (Claude Code) herda e usa ≥1 skill do gate | Must | **Novo (MVP E1)** |
| RF-I5 | Config-por-IA: skill interna troca peça usando a engine | Should | **Novo (MVP E2)** |

### 5.4 Plano de Observabilidade
| ID | Requisito | Prioridade | Estado |
|---|---|---|---|
| RF-O1 | Consumo/custo por modelo/run/ferramenta | Must | Parcial (pricing existe) |
| RF-O2 | Runs ao vivo + vitalidade (ativo/travado/ocioso/concluído) | Should | Planejado (F20/F23) |
| RF-O3 | Grafo da arquitetura sendo executada (DAG do plano) | Could | Parcial (graph existe) |
| RF-O4 | Economia de token por saver | Could | Planejado (F28) |

### 5.5 Roteamento de modelos (SmartRouter) ★
| ID | Requisito | Prioridade | Estado |
|---|---|---|---|
| RF-R1 | Rotear tarefa→modelo por custo/complexidade/latência | Must | Planejado (promover F17/F27) |
| RF-R2 | Fallback determinístico + budget-aware | Should | Planejado |
| RF-R3 | Recomendador de modelo por hardware | Could | Feito (base) |

## 6. Requisitos não-funcionais (produto)

- RNF-1 **TTFV** < 15 min no caminho mínimo (sem Jev, sem opcionais).
- RNF-2 **Fail-open:** uma falha do gate nunca quebra o agente (exceto fail-closed deliberado).
- RNF-3 **Headless-friendly:** toda ação read-only imprime texto puro; tudo scriptável.
- RNF-4 **Local-first/privacidade:** execução e dados locais por padrão; fronteiras de dado documentadas.
- RNF-5 **Portabilidade:** mesmo setup funciona em ≥2 clientes MCP.
- RNF-6 **Descoberta:** menus/TUI e `gate --help` tornam recursos descobríveis sem decorar.

## 7. Superfícies de produto (UX)

| Superfície | Papel | Público |
|---|---|---|
| **MCP** | A interface primária de *uso* — consumida por qualquer host | Toda ferramenta de IA |
| **CLI** | Admin/automação/CI, headless, SSH | Dev/power-user |
| **TUI (Ink)** | Painel de admin e cockpit de run (escopo controlado, não expandir sem validar) | Dev/power-user |
| **Web local** | Dashboard de observação + revisão/aprovação (experimento com critério de desligamento) | Revisor, inclusive menos técnico |

## 8. Épicos e releases (mapa pro MVP North Star)

| Release | Épico | Requisitos | Critério de saída |
|---|---|---|---|
| **R0** | Release hygiene | LICENSE, versão, CI, pacote, caminho mínimo | Externo instala, roda tarefa protegida, entende recusa sem autor |
| **R1** | Inversão MCP mínima | RF-I1, RF-I2, RF-I4 | Claude Code externo herda 1 skill + vê consumo |
| **R2** | Config-por-IA | RF-I5, RF-C6 | Trocar Jev por advisor externo sem adapter hardcoded |
| **R3** | SmartRouter + usage | RF-R1, RF-R2, RF-O1 | ≥2 modelos roteados por política, consumo exposto no MCP |
| **R4+** | Observabilidade, budget, OWASP, skills batches | F18–F28 | Sob demanda e critério North Star |

## 9. Critérios de aceite (amostra, formato Given/When/Then)

- **RF-I4:** *Dado* um Claude Code externo apontado pro MCP do gate, *quando* o usuário listar prompts, *então* as skills do gate aparecem e ao menos uma é invocável e produz efeito — sem configuração adicional por host.
- **RF-I5:** *Dado* o Jev ligado, *quando* o usuário pedir para usar um advisor externo, *então* o gate gera, aplica e verifica a config, desliga o Jev e liga o externo, registrando a troca no journal.
- **RF-G8:** *Dado* um gate que sofre timeout, *quando* a checagem não puder concluir, *então* o comportamento (allow/advise/block/pedir revisão) é o declarado para aquele gate — nunca indefinido.

## 10. Métricas de produto

TTFV · nº de clientes MCP distintos ativos · skills reusadas por host · tokens economizados · razão bloqueio-útil/falso-positivo · latência adicionada por gate (separando consulta ao Jev) · retorno em novos projetos.

## 11. Dependências e riscos de produto

- Depende do MCP como contrato estável entre hosts.
- Risco: duplicação de telas TUI↔web (mitigar com backend único + escopo mínimo da web).
- Risco: estado desatualizado em aprovação (plano/diff mudou) → aprovação vinculada à versão (ver TRD).
- Risco: expandir TUI/observabilidade antes de validar o núcleo → gate do North Star.

## 12. Perguntas em aberto

- Qual o conjunto mínimo de skills que faz sentido expor como prompts na R1?
- Commands do gate mapeiam 1:1 para prompts MCP, ou precisam de um wrapper?
- Até onde a config-por-IA pode ir com segurança sem revisão humana obrigatória?
- Nome final/npm; marca.
