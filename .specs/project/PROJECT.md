# Gatewright — Project

## Vision
Uma camada open-source e headless que impõe disciplina em agentes de IA de código, com guardrails versionados no próprio repo.

## Problem
Agentes de código (Claude Code, Codex, etc.) derrapam sozinhos: escopo que cresce sem controle, diffs gigantes, verificação pulada (sem typecheck/test), leitura de segredos, zero controle de budget/token, e padrões de projeto re-explicados em todo prompt. Não existe uma camada **open-source, headless e plugável** que governe o agente de forma versionada.

## Goals
1. Motor de **gates plugáveis** (plan, completion, proportion, secret, budget, quality) como funções payload→decisão.
2. **Backbone event-sourced** (journal hash-encadeado + artifact store + recovery) como fundação de toda a governança.
3. **Servidor MCP local** + abstração de host (Claude Code / Codex) headless.
4. **Padrões-como-código** lidos do repo (`AGENTS.md`/`CLAUDE.md` + `gate.config`); se um padrão não existe, o agente pergunta, não chuta.
5. **Skills manager** — catálogo + instalar + criar skill.
6. **Jev** — motor de decisão com IA local (advisory pro gate humano) pros casos fuzzy.

## Target User
Devs e times que trabalham com agentes de código e querem guardrails/governança versionados. Open-source. Uso pessoal do Rafael: formaliza o modo-tutor/SDD como produto.

## Non-Goals (current)
- UI (TUI/desktop) — fica pra fase futura (F6+); v1 é headless.
- Acoplamento a um editor específico (ex.: VSCode/Electron) — Gatewright é headless-first.
- Jev como decisor autônomo — Jev é **sempre advisory**, nunca bloqueio não-determinístico.

## Constraints
- **Stack:** TS/Node (ESM, strict), `@modelcontextprotocol/sdk`, vitest. Sem Electron.
- **Processo:** modo-tutor **invertido** — Claude implementa (código, specs/tasks, commits, PRs); Rafael valida/orquestra, merge = gate humano. GitHub Flow.
- **Commits/branches:** sem trailer `Co-Authored-By: Claude`.
- **Clean-room:** arquitetura/conceitos derivados de análise comportamental do HubStack; zero código/assets/marca de terceiros.
- **Complexidade:** alvo = mesma máquina do HubStack ou além (não versão enxuta).
- **Jev local-first:** Ollama/LM Studio, fallback cloud opcional, budget-aware.
