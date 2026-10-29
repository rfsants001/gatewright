# Gate Failure Policy

> **R0.5 artefact** — per-gate behavior for every failure mode, plus the explicit
> decision on fail-open vs. fail-safe. Behavioral changes are never silent: any
> change to a gate's failure behavior is a separate task (R0.5-006b), never embedded
> in a documentation or test commit.

## Failure modes defined

| Code | Description |
|---|---|
| **violation** | The gate's check logic ran and produced a `deny` decision (the normal "gate fired" case) |
| **timeout** | The gate's `check()` call did not return within a time budget |
| **invalid-payload** | `parseClaudeCodeEvent` returns `null` (unparseable JSON, non-record, or unrecognised event/tool) |
| **exception** | The gate's `check()` call threw an uncaught exception |

---

## Current failure behavior (as of R0.5)

### Global wrapper — `runHook` / `runHookWithJev`

Both entrypoints wrap the entire pipeline in a `try/catch → {stdout:"",exitCode:0}`.
Additionally, `parseClaudeCodeEvent` returns `null` on any parse/mapping failure, which causes
`runHook` to return the silent-allow immediately.

This means **every** failure mode below (timeout, invalid-payload, exception) ultimately
produces a **silent allow** at the hook layer — the host Claude Code process is never
interrupted by a gate failure.

### Engine — `runGates`

The engine (`src/core/gate/engine.ts`) has a per-gate `try/catch` that **isolates** a
throwing gate: the gate is recorded in `errors` and treated as allow. The remaining gates
still run. This means an exception in one gate does not prevent other gates from acting.

---

## Per-gate failure table

| Gate | Events | Violation result | Timeout | Invalid payload | Exception in `check()` |
|---|---|---|---|---|---|
| **secret-guard** | `pre-read`, `pre-bash` | `deny` (permissionDecision) | `allow` (fail-open — no timeout guard; pure sync logic, no I/O) | `allow` (mapEvent null → runHook returns before reaching gate) | `allow` (engine isolates; `errors[]` records it) |
| **verify-on-edit** | `post-edit` | `advise` (systemMessage) | `allow` (no timeout guard; `existsSync`/`readFileSync` are sync, may block on slow I/O but do not have a deadline) | `allow` (mapEvent null) | `allow` (engine isolates) |
| **error-classifier** | `post-bash` | `advise` (systemMessage) | `allow` (no timeout guard; pure regex, never blocks) | `allow` (mapEvent null) | `allow` (engine isolates; gate has internal check: `if (!tr || typeof tr !== "object") return allow`) |
| **proportion-gate** | `stop` | `advise` (or `deny` if `enforce:true`) | `allow` (git subcommands have a 15 s `GIT_TIMEOUT_MS` guard inside the gate; on timeout `sh()` returns `""` → changedFileCount returns 0 → allow) | `allow` (mapEvent null) | `allow` (engine isolates; `sh()` has internal try/catch) |
| **completion-gate** | `stop` | `deny` (block, native flow only) | `allow` (fail-open — no native binding outside native flow) | `allow` (mapEvent null) | `allow` (engine isolates; gate returns allow when `resolve` returns null) |
| **quality-gate** | `subagent-stop` | `deny` (native) or `deny` (legacy heuristic) | `allow` (fail-open — no native binding outside native flow; legacy heuristic is pure regex) | `allow` (mapEvent null) | `allow` (engine isolates) |
| **plan-gate** | `pre-edit` | `deny` (permissionDecision) | `allow` (no native binding → fails open) | `allow` (mapEvent null) | `allow` (engine isolates; returns allow when no `Plan` is loaded) |

---

## Failure-mode detail notes

### Timeout
No gate today has an explicit per-call timeout guard beyond the `GIT_TIMEOUT_MS` in
`proportion-gate.ts`. All other gates are pure synchronous logic (regex, path checks) or
fail-open when a dependency (native binding, plan store) is absent. The net effect of a
hypothetical long-running gate is the hook process blocks — but this has not been
observed in practice. A future improvement would add a per-gate deadline (not in scope
for R0.5).

### Invalid payload
`parseClaudeCodeEvent` → null on:
- Invalid JSON (JSON.parse throws → returns null)
- Non-record JSON (array, primitive)
- `hook_event_name` not in `{PreToolUse, PostToolUse, Stop, SubagentStop}`
- `tool_name` not in the native tool list (including all `mcp__*` tools — see R0.5-004)

In all cases `runHook` returns `{stdout:"",exitCode:0}` before any gate runs.

### Exception in `check()`
`runGates` (engine) wraps each gate in `try/catch`:
```
try {
  if (!gate.appliesTo(ctx)) continue;
  decision = gate.check(ctx);
} catch (error) {
  errors.push({ gate: gate.name, error: message(error) });
  continue;  // ← treated as allow; remaining gates still run
}
```
The outer `runHook` `try/catch` provides a second safety net for any exception that
escapes the engine (e.g., thrown in `adapter.parse` or `adapter.render`).

---

## Decision: fail-open vs. fail-safe

**Decision: KEEP FAIL-OPEN for all gates in R0.5. R0.5-006b is SKIPPED.**

### Reasoning

The current fail-open posture is intentional for this stage. The rationale:

1. **Secret-guard** (the most safety-sensitive gate): its `check()` is pure synchronous
   logic with no I/O dependencies that could fail. The only realistic failure path is an
   uncaught exception from a very unusual input (e.g., a non-string `file_path`). The
   gate already has a guard: `if (!p) return false` in `isSecretPath`. Making it
   fail-safe would mean a JSON parse error or a malformed payload blocks ALL reads —
   which is too noisy and would break the hook for unrelated events. The R0.5 goal is
   evidence, not behavior change.

2. **Plan-gate**: requires a loaded `Plan`. When the plan store is absent (the normal
   state in `defaultRegistry`), the gate returns allow. Making it fail-safe would mean
   a missing plan BLOCKS all edits — too aggressive for R0.5.

3. **Exception isolation**: the engine already isolates throwing gates and records them
   in `errors`. This is a better approach than global fail-safe: it prevents a buggy gate
   from silently blocking all operations.

4. **Scope**: R0.5 is an evidence feature. Behavior changes belong in a dedicated task.
   Changing failure policy silently would violate the NF-003 requirement.

### If fail-safe is desired (future R0.5-006b trigger conditions)

The table should be revisited when:
- secret-guard has been observed to fail-open in a production incident.
- Plan-gate is live-wired in defaultRegistry and a missing plan should block edits.
- A specific gate's failure mode is observed to allow harmful actions through.

---

## R0.5-006b status

**SKIPPED.** The decision above is to maintain fail-open for all gates in R0.5.
No behavioral change is made in this release. Any future fail-safe implementation must
be a separate explicit task with a test proving the new decision.
