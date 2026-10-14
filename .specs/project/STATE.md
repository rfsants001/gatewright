# Gatewright — State

## Current Phase
Phase 0 — Backbone event-sourced (🔄 IN PROGRESS). Specs criados 2026-10-14; branch `feat/f0-backbone`.
3 features → 15 tasks atômicas: portable-artifact-store (5) → event-sourced-journal (6) → run-binding-store (4).

## Decisions
- **Complexidade total** (14/10): alvo = mesma máquina do HubStack ou além, não versão enxuta.
- **Modo-tutor invertido:** Claude implementa; Rafael valida/orquestra; merge = gate humano.
- **Clean-room:** arquitetura/conceitos do HubStack via análise comportamental; zero código de terceiros.
- **Jev advisory-only:** IA local nunca bloqueia de forma não-determinística — só opina pro gate humano.
- **Skills:** espelhar taxonomia/formato (= skill do Claude Code), conteúdo próprio.
- **Ordem por dependência:** backbone event-sourced (F0) antes de qualquer gate.

## Deferred Ideas
- UI (TUI Ink / desktop Tauri) — F6+.
- Jev aprende com correções; fleet distribuído; gate marketplace — F6.

## Blockers
None.

## Lessons Learned
- quality-gate/completion-gate do HubStack dependem de reconciliação nativa (lease vivo + grafo + invocações) — não black-boxáveis por fixture; só no dogfood real. Spec derivada do código na vault `clean-room/`.

## Preferences
planning_path: ~/Documentos/planning-vault/ideias/projetos/gatewright
- Commits e branches **sem** `Co-Authored-By: Claude`.
- SDD + GitHub Flow (branch por feature → PR → merge pelo Rafael).
- Stack TS/Node default; DS&A aplicado de propósito (hash chain, FSM, DAG, ready-queue, locks).

*Last updated: 2026-10-14*
