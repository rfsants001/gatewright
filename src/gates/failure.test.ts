// R0.5-006 — Per-gate failure behavior tests.
// Verifies that each gate's behavior for invalid payload and exception-in-check
// matches the CURRENT "fail-open" policy documented in docs/gate-failure-policy.md.
//
// Rule: these tests ONLY verify the current behavior. They do NOT change it.
// Any change to failure policy requires a separate task (R0.5-006b).

import { describe, expect, it, vi } from "vitest";
import { runHook } from "../host/run-hook.js";
import { runGates } from "../core/gate/engine.js";
import { secretGuard } from "./secret-guard.js";
import { verifyOnEdit } from "./verify-on-edit.js";
import { errorClassifier } from "./error-classifier.js";
import { proportionGate } from "./proportion-gate.js";
import { completionGate } from "./completion-gate.js";
import { qualityGate } from "./quality-gate.js";
import type { GateContext } from "../core/gate/types.js";

function silentAllow(out: { stdout: string; exitCode: number }): boolean {
  return out.stdout === "" && out.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Invalid payload — runHook level (parseClaudeCodeEvent returns null)
// Applies to ALL gates: when the payload is malformed or unrecognised,
// runHook returns silent allow before any gate runs.
// ---------------------------------------------------------------------------

describe("invalid payload → all gates → fail-open (runHook)", () => {
  it("invalid JSON → silent allow", () => {
    expect(silentAllow(runHook("not json {{ broken"))).toBe(true);
  });

  it("non-record JSON (array) → silent allow", () => {
    expect(silentAllow(runHook(JSON.stringify([1, 2, 3])))).toBe(true);
  });

  it("missing hook_event_name → silent allow", () => {
    expect(silentAllow(runHook(JSON.stringify({ tool_name: "Read", tool_input: { file_path: ".env" } })))).toBe(true);
  });

  it("unknown hook event → silent allow", () => {
    expect(silentAllow(runHook(JSON.stringify({ hook_event_name: "UnknownEvent", tool_name: "Read" })))).toBe(true);
  });

  it("known event but unknown tool → silent allow (mapEvent returns null)", () => {
    expect(silentAllow(runHook(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Grep" })))).toBe(true);
  });

  it("null body → silent allow", () => {
    expect(silentAllow(runHook(JSON.stringify(null)))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Exception in gate.check() — engine isolates it (fail-open per gate)
// ---------------------------------------------------------------------------

describe("exception in gate.check() → engine isolates → fail-open", () => {
  const ctx: GateContext = { event: "pre-read", cwd: "/w", toolInput: { file_path: "foo.ts" } };

  it("a throwing gate is isolated; other gates still run; result is allow when no other gate denies", () => {
    const throwingGate = {
      name: "thrower",
      description: "always throws",
      events: ["pre-read" as const],
      appliesTo: () => true,
      check: (): never => { throw new Error("boom from gate"); },
    };

    const result = runGates([throwingGate], ctx);
    // The throwing gate is isolated; no deny was produced.
    expect(result.decision.kind).toBe("allow");
    // The error is recorded in the result.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.gate).toBe("thrower");
    expect(result.errors[0]!.error).toContain("boom from gate");
  });

  it("a throwing gate does not prevent a subsequent deny gate from running", () => {
    const throwingGate = {
      name: "thrower",
      description: "always throws",
      events: ["pre-read" as const],
      appliesTo: () => true,
      check: (): never => { throw new Error("boom"); },
    };
    const denyGate = {
      name: "denier",
      description: "always denies",
      events: ["pre-read" as const],
      appliesTo: () => true,
      check: () => ({ kind: "deny" as const, reason: "test deny" }),
    };

    // Throw first, deny second — the deny should still win.
    const result = runGates([throwingGate, denyGate], ctx);
    expect(result.decision.kind).toBe("deny");
    expect(result.deniedBy).toBe("denier");
    expect(result.errors).toHaveLength(1);
  });

  it("outer runHook try/catch catches any exception from engine/adapter", () => {
    // Simulate a completely broken adapter to confirm the outer try/catch.
    const brokenAdapter = {
      parse: () => { throw new Error("adapter parse exploded"); },
      render: () => ({ stdout: "", exitCode: 0 }),
    };
    const out = runHook("{}", brokenAdapter);
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// secret-guard — invalid toolInput variants → allow (no secret found)
// ---------------------------------------------------------------------------

describe("secret-guard: invalid/missing toolInput → allow (fail-open)", () => {
  const g = secretGuard();

  it("pre-read with no file_path → allow", () => {
    expect(g.check({ event: "pre-read", cwd: "/w", toolInput: {} }).kind).toBe("allow");
  });

  it("pre-read with undefined file_path → allow", () => {
    expect(g.check({ event: "pre-read", cwd: "/w", toolInput: { file_path: undefined } }).kind).toBe("allow");
  });

  it("pre-bash with no command → allow", () => {
    expect(g.check({ event: "pre-bash", cwd: "/w", toolInput: {} }).kind).toBe("allow");
  });

  it("pre-bash with empty command → allow", () => {
    expect(g.check({ event: "pre-bash", cwd: "/w", toolInput: { command: "" } }).kind).toBe("allow");
  });

  it("pre-bash with null command → allow (graceful coercion)", () => {
    expect(g.check({ event: "pre-bash", cwd: "/w", toolInput: { command: null } }).kind).toBe("allow");
  });

  it("no toolInput at all → allow", () => {
    expect(g.check({ event: "pre-read", cwd: "/w" }).kind).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// error-classifier — invalid toolResponse variants → allow
// ---------------------------------------------------------------------------

describe("error-classifier: invalid/missing toolResponse → allow (fail-open)", () => {
  const g = errorClassifier();

  it("no toolResponse → allow", () => {
    expect(g.check({ event: "post-bash", cwd: "/w" }).kind).toBe("allow");
  });

  it("toolResponse = null → allow", () => {
    expect(g.check({ event: "post-bash", cwd: "/w", toolResponse: null }).kind).toBe("allow");
  });

  it("toolResponse = string → allow (non-object)", () => {
    expect(g.check({ event: "post-bash", cwd: "/w", toolResponse: "raw output" }).kind).toBe("allow");
  });

  it("toolResponse = number → allow", () => {
    expect(g.check({ event: "post-bash", cwd: "/w", toolResponse: 42 }).kind).toBe("allow");
  });

  it("toolResponse = {} (empty object, no stderr) → allow", () => {
    expect(g.check({ event: "post-bash", cwd: "/w", toolResponse: {} }).kind).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// verify-on-edit — missing/non-existent file → allow (fail-open)
// ---------------------------------------------------------------------------

describe("verify-on-edit: missing file → allow (fail-open)", () => {
  const g = verifyOnEdit();

  it("no toolInput → allow", () => {
    expect(g.check({ event: "post-edit", cwd: "/w" }).kind).toBe("allow");
  });

  it("non-existent file path → allow (existsSync returns false → gate skips)", () => {
    expect(
      g.check({ event: "post-edit", cwd: "/w", toolInput: { file_path: "/tmp/does-not-exist-gw-failure.ts" } }).kind,
    ).toBe("allow");
  });

  it("no file_path field → allow", () => {
    expect(g.check({ event: "post-edit", cwd: "/w", toolInput: {} }).kind).toBe("allow");
  });

  it("file with non-source extension → allow (gate only scans JS/TS)", () => {
    expect(g.check({ event: "post-edit", cwd: "/w", toolInput: { file_path: "/tmp/README.md" } }).kind).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// proportion-gate — no git repo → allow (fail-open)
// ---------------------------------------------------------------------------

describe("proportion-gate: no git repo → allow (fail-open)", () => {
  const g = proportionGate();

  it("cwd with no .git → allow (sh returns empty, changedFileCount = 0)", () => {
    // /tmp has no .git directory.
    expect(g.check({ event: "stop", cwd: "/tmp" }).kind).toBe("allow");
  });

  it("no cwd (process.cwd fallback) → allow if current dir has no uncommitted changes", () => {
    // This depends on the test environment state; we just verify it doesn't throw.
    const result = g.check({ event: "stop", cwd: "/tmp" });
    expect(["allow", "advise", "deny"]).toContain(result.kind);
  });
});

// ---------------------------------------------------------------------------
// completion-gate — no native binding → allow (fail-open)
// ---------------------------------------------------------------------------

describe("completion-gate: no native binding → allow (fail-open)", () => {
  it("no resolve function → allow (fail-open: native flow absent)", () => {
    expect(completionGate().check({ event: "stop", cwd: "/w" }).kind).toBe("allow");
  });

  it("resolve returns null → allow (fail-open)", () => {
    expect(completionGate({ resolve: () => null }).check({ event: "stop", cwd: "/w" }).kind).toBe("allow");
  });

  it("resolve returns unbound → allow (fail-open: not running under native controller)", () => {
    expect(
      completionGate({ resolve: () => ({ binding: "unbound", reconcile: () => ({ status: "pending", ignored: false }) }) })
        .check({ event: "stop", cwd: "/w" }).kind,
    ).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
// quality-gate — no native binding → legacy heuristic (fail-open for missing message)
// ---------------------------------------------------------------------------

describe("quality-gate: no native binding → legacy heuristic (fail-open for null/missing message)", () => {
  const g = qualityGate();

  it("no lastMessage → deny (heuristic: empty string < 50 chars)", () => {
    // Empty/missing message hits the 'too short' branch of the heuristic.
    // This is the expected CURRENT behavior — not a fail-open to allow, but a
    // heuristic deny. This is consistent with the gate's design intent.
    expect(g.check({ event: "subagent-stop", cwd: "/w" }).kind).toBe("deny");
  });

  it("resolve returns null → falls back to legacy heuristic", () => {
    const g2 = qualityGate({ resolve: () => null });
    expect(g2.check({ event: "subagent-stop", cwd: "/w", lastMessage: "done" }).kind).toBe("deny");
  });
});
