# Gatewright

> Open-source, headless guardrails/governance layer for AI code agents. CLI (`gate`) + local MCP server.

Gatewright enforces discipline on coding agents (Claude Code, Codex, …) — scope control, completion
verification, diff proportion, secret protection, budget, and handoff quality — as **gates versioned in the
repo**, plus a skills manager and an optional local-AI decision engine (**Jev**).

## Status

Early scaffold. Building the **event-sourced backbone first** (F0). See the full design and roadmap in the
planning vault: `ideias/projetos/gatewright/` (`architecture.md`, `README.md`, `clean-room/`).

## Roadmap (by dependency)

- **F0 · Backbone event-sourced** — hash-chained journal + portable artifact store + run-binding + crash recovery.
- **F1 · Ownership & lifecycle** — control state machine + session lease (fencing · heartbeat · TTL).
- **F2 · MCP + host-contract + payload-only gates** — first end-to-end dogfood.
- **F3 · Plan-gate + execution graph** — scope admission + DAG + ready-queue.
- **F4 · Dispatch + native reconciliation + Jev** — agent system + the native quality/completion flow + local-AI decisions.
- **F5 · Registries + Skills manager + evidence + worktrees**.
- **F6 · Beyond** — replay/time-travel, semantic graph, formal transition verification, distributed fleet, skill marketplace.

## Dev

```sh
npm install
npm run typecheck
npm test
npm run build
```

Node ≥ 22 (dev on 24). TypeScript, ESM (NodeNext), Vitest.

## Provenance

Clean-room reimplementation: architecture and concepts only, derived from behavioral analysis — no third-party
code or assets reused.
