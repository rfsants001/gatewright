# Changelog

All notable changes to Gatewright. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions use [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Config change history** — every configuration change the CLI makes is recorded as a
  revision (which files, when, before/after). View it with `gate history`.
- **Rollback** — `gate rollback [id]` restores a previous revision's files (itself recorded,
  so a rollback is auditable and re-revertible).
- **Fix** — `gate fix` runs diagnostics and lets you select exactly which pending items to
  configure, with the same preview → confirm → backup flow.
- `gate changelog` prints this file.

## [0.1.0] — 2026-10-15

First consolidated preview across the F0–F7 roadmap.

### Added
- **Event-sourced backbone** — append-only hash-chained journal, portable artifact store
  (atomic writes + crash recovery), run-binding store.
- **Ownership & lifecycle** — control state machine + session lease (fencing · heartbeat · TTL).
- **MCP + host-contract** — local stdio MCP server and a Claude Code host adapter.
- **Gates** — secret-guard, verify-on-edit, error-classifier, proportion-gate, plan-gate,
  completion-gate, quality-gate.
- **Execution graph** — DAG with topological order, ready-queue, blocked propagation.
- **Agent system** — registry, capability assignment, async dispatch scheduler.
- **Native reconciliation** — binds host start/stop to graph-node transitions.
- **Jev** — local-AI advisory decision engine (budget-aware, journal-logged, calibrates from
  human corrections); never blocks.
- **Composable validators** + validator/step/workflow registries.
- **Goal verification** — finding-ledger, evidence-progress, goal-verifier.
- **Skills manager** — SKILL.md catalog, enable/disable, `gate skill new`.
- **Worktree per run**, **run replay / time-travel** (`gate replay`), **formal transition
  verification**, **fleet + gate marketplace** (typed-contract packages).
- **Onboarding** — `gate doctor` (status board) and `gate init` (self-configuration wizard)
  with a clack + picocolors TUI; global project registry.
