# Host Support Matrix

> **R0.5 artefact** — honest capability map per host. Claude Code is the only
> fully-supported host today. Codex CLI and OpenCode are stubs: the adapter
> skeleton exists or is planned, but no hook integration is live.
>
> Language is deliberately conservative — no superdimensioning of support.
> Aligns with parecer §8.6 (host coverage claims).

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and tested |
| ⚠️ | Partial / limited (see note) |
| 🔲 `stub` | Skeleton exists but not wired or tested |
| ❌ | Not supported / not applicable |
| `?` | Unknown / not yet investigated |

---

## Capability definitions

| Capability | Description |
|---|---|
| **detection** | Gatewright can detect whether this host is installed and configured (e.g., binary present, settings readable) |
| **execution** | Gatewright can launch a session under this host |
| **hooks** | The host exposes a hook mechanism that Gatewright can intercept (pre/post tool calls, stop events) |
| **blocking** | Gatewright can produce a `deny` decision that the host respects and halts the tool call |
| **cancellation** | Gatewright can produce a `block` decision on `Stop`/`SubagentStop` that halts the agent turn |

---

## Matrix

| Capability | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|
| **detection** | ✅ Detected via `~/.claude/` settings dir and `claude` binary (R0 doctor) | 🔲 `stub` — binary probe planned | 🔲 `stub` — binary probe planned |
| **execution** | ✅ Launched via `claude` CLI with `--dangerously-skip-permissions` + gate flags | 🔲 `stub` | 🔲 `stub` |
| **hooks** | ✅ `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop` hook events via `~/.claude/settings.json` `hooks` config | ❌ No hook mechanism in Codex CLI as of this writing | ? OpenCode hook support not yet investigated |
| **blocking** | ✅ `permissionDecision: "deny"` on `PreToolUse` hooks; tested end-to-end (R0.5-002) | ❌ No hook → no blocking | ? |
| **cancellation** | ✅ `{decision:"block",reason}` on `Stop`/`SubagentStop` hooks; tested (R0.5-003) | ❌ No hook → no cancellation | ? |

---

## Notes

### Claude Code (fully supported)

- Hook payloads follow the shape documented in `src/host/claude-code.ts`.
- Supported native tool names: `Read`, `read_file`, `Edit`, `Write`, `MultiEdit`,
  `create_file`, `apply_patch`, `insert_edit_into_file`, `replace_string_in_file`,
  `Bash`, `run_in_terminal`.
- MCP tool calls (`mcp__*`) pass through without governance today (documented gap — F18).
- See `docs/governance-coverage.md` for the full per-path matrix.

### Codex CLI (stub)

Codex CLI (OpenAI's agent CLI) does not expose a hook mechanism equivalent to
Claude Code's `PreToolUse`/`PostToolUse` hooks. Gatewright cannot intercept tool
calls at the hook layer. Stub detection exists in the R0 doctor (`src/core/env/detect.ts`)
to show the binary as optional.

Any Gatewright integration with Codex would require either:
(a) A wrapper layer that proxies tool calls through Gatewright's gate engine, or
(b) An out-of-process approach (e.g., eBPF/ptrace-level interception — out of scope).

This capability is marked `stub` in the matrix with honesty: the adapter does not exist.

### OpenCode (unknown)

OpenCode hook/plugin support has not been investigated as of R0.5. Marked `?` until
an investigation is done. Do not claim support without verified testing.

---

## What "fully supported" means for Claude Code

A session launched by Gatewright under Claude Code:
1. Has `hooks` injected into `~/.claude/settings.json` (or a project-level
   `.claude/settings.json`) pointing to the Gatewright hook binary.
2. Every `PreToolUse` for a native tool triggers `runHook`; the gate decision
   is respected by Claude Code before the tool executes.
3. Every `PostToolUse` for a native tool triggers `runHook`; advisory messages
   are injected into the model context as `systemMessage`.
4. `Stop` and `SubagentStop` events trigger `runHook`; a `deny` blocks the turn.

Limitations (honest):
- MCP tool calls bypass all gates (fall-through to allow) — see F18.
- `plan-gate`, `completion-gate`, `quality-gate` require the native flow
  (Jev lease + invocation graph + reconcile) and are not active in a minimal
  `defaultRegistry()` deployment.
