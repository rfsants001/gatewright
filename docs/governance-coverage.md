# Governance Coverage Matrix

> **R0.5 artefact** — maps every agent action path to its GateEvent, the gate(s) that act,
> whether the path is covered by a test, and the current decision.
>
> **Versioning rule:** any change to a "covered" entry MUST be accompanied by a matching
> test change. The guard test `src/host/coverage.test.ts` fails if a covered path loses
> coverage.

## Legend

| Column | Meaning |
|---|---|
| Path | The agent action as seen by the hook layer |
| Hook event | Raw Claude Code hook event (`PreToolUse` / `PostToolUse` / `Stop` / `SubagentStop`) |
| Tool name | The `tool_name` field in the hook payload (blank for Stop/SubagentStop) |
| GateEvent | The `GateEvent` value returned by `mapEvent`, or `null` |
| Active gates | Gate(s) in `defaultRegistry()` that have `appliesTo(ctx) === true` |
| Tested | `yes` = an automated test sends a real payload and asserts the decision; `no` = not yet; `n/a` = not applicable |
| Decision | `allow` (silent) · `advise` (systemMessage) · `deny` (block/permissionDecision) · `fall-through → allow` (mapEvent null, no gate runs) |

---

## Matrix

| # | Path | Hook event | Tool name | GateEvent | Active gates (defaultRegistry) | Tested | Decision |
|---|---|---|---|---|---|---|---|
| 1 | Native read (`Read`) | `PreToolUse` | `Read` | `pre-read` | secret-guard | yes | deny (secret file) / allow |
| 2 | Native read (`read_file`) | `PreToolUse` | `read_file` | `pre-read` | secret-guard | yes | deny (secret file) / allow |
| 3 | Native edit (`Edit`) | `PreToolUse` | `Edit` | `pre-edit` | _(none in defaultRegistry)_ | yes | allow |
| 4 | Native write (`Write`) | `PreToolUse` | `Write` | `pre-edit` | _(none in defaultRegistry)_ | yes | allow |
| 5 | Native multi-edit (`MultiEdit`) | `PreToolUse` | `MultiEdit` | `pre-edit` | _(none in defaultRegistry)_ | yes | allow |
| 6 | Native shell pre (`Bash`) | `PreToolUse` | `Bash` | `pre-bash` | secret-guard | yes | deny (secret read cmd) / allow |
| 7 | Native shell pre (`run_in_terminal`) | `PreToolUse` | `run_in_terminal` | `pre-bash` | secret-guard | yes | deny (secret read cmd) / allow |
| 8 | Native shell post (`Bash`) | `PostToolUse` | `Bash` | `post-bash` | error-classifier | yes | advise (error) / allow |
| 9 | Native edit post (`Edit`) | `PostToolUse` | `Edit` | `post-edit` | verify-on-edit | yes | advise (issues) / allow |
| 10 | Stop | `Stop` | — | `stop` | proportion-gate | yes | advise (over-reach) / allow |
| 11 | SubagentStop | `SubagentStop` | — | `subagent-stop` | _(none in defaultRegistry — quality-gate needs native flow)_ | yes | allow |
| 12 | MCP tool call (`mcp__*`) | `PreToolUse` | `mcp__<server>__<tool>` | `null` (mapEvent returns null) | _(none — no gate runs)_ | yes | **fall-through → allow** (see note below) |
| 13 | Unknown / ungoverned tool | `PreToolUse` | e.g. `Grep`, `Search` | `null` | _(none)_ | yes | fall-through → allow |
| 14 | Malformed payload (invalid JSON) | — | — | `null` | _(none)_ | yes | fall-through → allow (parse returns null) |

---

## Notes

### Path 10 — Stop / proportion-gate
`proportion-gate` is in `defaultRegistry()` and runs on `stop`. It calls `git status`/`git diff`
in `ctx.cwd`. With no git repo (fixture), `changedFileCount` returns 0 → allow. The test
uses a temp dir with no `.git` to get a clean allow; over-reach is covered in the gate's own
unit test (`proportion-gate.test.ts`).

### Path 11 — SubagentStop / quality-gate
`quality-gate` and `completion-gate` are **not** wired into `defaultRegistry()`. They require
the native flow (lease + invocation graph + reconcile). Outside that flow both gates fail-open.
The hook entrypoint (`runHook`) with `defaultRegistry()` therefore produces a silent allow on
`SubagentStop`. This is intentional and documented here; it is NOT a silent gap.

### Path 12 — MCP-tool fall-through (key finding)
`mapEvent` in `src/host/claude-code.ts` only recognises native tool names
(`Read`, `Edit`, `Write`, `MultiEdit`, `Bash`, `run_in_terminal`, …). An MCP tool call whose
`tool_name` matches `mcp__<server>__<tool>` does **not** match any branch → `mapEvent` returns
`null` → `parseClaudeCodeEvent` returns `null` → `runHook` returns `{stdout:"",exitCode:0}`
(silent allow). **No gate runs deterministically for any MCP tool call today.**

This is a documented, intentional-for-now behaviour. Implementing a generic `GateEvent` or
tool policy for MCP tools is **out of scope for R0.5** and tracked as **F18**.

### Paths 3–5 — pre-edit with no active gate
`plan-gate` is the gate that acts on `pre-edit`, but it lives in `src/core/plan/plan-gate.ts`
and requires a loaded `Plan` — it is **not** wired into `defaultRegistry()`. So a native
`Edit`/`Write`/`MultiEdit` `PreToolUse` maps to `pre-edit` correctly, but no gate in the
default registry acts on it → allow.

---

## Coverage invariant (enforced by `src/host/coverage.test.ts`)

The 9 paths marked `Tested: yes` in rows 1–13 each have at least one test that:
1. Sends a syntactically valid hook payload through `runHook` (or `parseClaudeCodeEvent`).
2. Asserts the documented decision.

The guard test fails if any of those paths regresses to a different decision.
