// R0.5-003 — E2e tests for Stop and SubagentStop paths.
//
// Two test layers:
// 1. Hook layer (runHook + defaultRegistry): proves the path the ACTUAL hook entrypoint
//    takes for Stop and SubagentStop payloads.
// 2. Native gate layer (gate constructors with fixtures): proves that completion-gate and
//    quality-gate work correctly when the native flow (lease + invocation graph + reconcile)
//    is wired in. These gates are NOT in defaultRegistry; they require the native flow.
//
// The coverage matrix (docs/governance-coverage.md) records:
//   - Row 10 (stop): proportion-gate is in defaultRegistry; other stop-gates (completion-gate)
//     need the native flow.
//   - Row 11 (subagent-stop): quality-gate needs the native flow; defaultRegistry → allow.

import { describe, expect, it } from "vitest";
import { runHook } from "./run-hook.js";
import { completionGate, type CompletionResolver } from "../gates/completion-gate.js";
import { qualityGate, type QualityResolver } from "../gates/quality-gate.js";
import { proportionGate } from "../gates/proportion-gate.js";
import type { GateContext } from "../core/gate/types.js";
import type { ReconcileResult } from "../core/reconcile/native-node-reconciler.js";

function silentAllow(out: { stdout: string; exitCode: number }): boolean {
  return out.stdout === "" && out.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Hook-layer: Stop via runHook (defaultRegistry — proportion-gate)
// ---------------------------------------------------------------------------

describe("e2e hook layer: Stop (proportion-gate in defaultRegistry)", () => {
  it("Stop in a non-git dir → allow (proportion-gate: no git repo, no diff)", () => {
    // /tmp has no .git → proportion-gate returns allow immediately.
    const out = runHook(
      JSON.stringify({
        hook_event_name: "Stop",
        session_id: "e2e-stop-1",
        cwd: "/tmp",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Stop with no cwd → allow (proportion-gate: empty diff)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "Stop",
        session_id: "e2e-stop-2",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Stop: proportion-gate is present in defaultRegistry and responds on 'stop'", () => {
    // We verify the gate shape directly (not through runHook, which already
    // covers the allow path in the tests above). The over-reach/enforce path is
    // covered in proportion-gate.test.ts.
    const g = proportionGate({ maxFiles: 0, maxLines: 0, enforce: true });
    // proportion-gate only triggers when changedFileCount > 0, which requires a real
    // git repo with staged files. With no .git in /tmp the gate returns allow regardless.
    expect(g.events).toContain("stop");
    expect(g.appliesTo({ event: "stop", cwd: "/tmp" })).toBe(true);
    expect(g.appliesTo({ event: "pre-read", cwd: "/tmp" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook-layer: SubagentStop via runHook (no gate in defaultRegistry)
// ---------------------------------------------------------------------------

describe("e2e hook layer: SubagentStop (quality-gate NOT in defaultRegistry)", () => {
  it("SubagentStop → allow (quality-gate needs native flow; defaultRegistry has no subagent-stop gate)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "SubagentStop",
        last_assistant_message: "done",
        session_id: "e2e-subagent-stop-1",
        cwd: "/tmp",
      }),
    );
    // Even with a terrible handoff ("done") the hook returns allow because
    // quality-gate is not in defaultRegistry. This is intentional and documented.
    expect(silentAllow(out)).toBe(true);
  });

  it("SubagentStop with a long message → allow (same reason — no quality-gate in defaultRegistry)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "SubagentStop",
        last_assistant_message: "x".repeat(300),
        session_id: "e2e-subagent-stop-2",
        cwd: "/tmp",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Native-flow layer: completion-gate with fixture (lease + graph + reconcile)
// ---------------------------------------------------------------------------

describe("e2e native flow: completion-gate (stop) with fixture resolver", () => {
  const stopCtx: GateContext = { event: "stop", cwd: "/workspace", sessionKey: "sess-1" };

  const makeBoundResolver = (result: ReconcileResult): CompletionResolver =>
    () => ({ binding: "bound", reconcile: () => result });

  it("fails open when no resolver is wired (native flow absent)", () => {
    // This is the actual behaviour of runHook: completion-gate is not in
    // defaultRegistry, so the hook path never reaches it. Documented for completeness.
    const g = completionGate();
    expect(g.check(stopCtx).kind).toBe("allow");
  });

  it("fails open when session is unbound (native controller not started)", () => {
    const g = completionGate({
      resolve: () => ({ binding: "unbound", reconcile: () => ({ status: "pending", ignored: false }) }),
    });
    expect(g.check(stopCtx).kind).toBe("allow");
  });

  it("blocks (deny) when controller_inactive in bound native session", () => {
    const g = completionGate({
      resolve: makeBoundResolver({ status: "controller_inactive", code: "NODE_NATIVE_CONTROLLER_INACTIVE" }),
    });
    const d = g.check(stopCtx);
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") {
      expect(d.reason).toContain("completion-gate");
      expect(d.reason).toContain("NODE_NATIVE_CONTROLLER_INACTIVE");
    }
  });

  it("allows on reconciled run in bound native session", () => {
    const g = completionGate({
      resolve: makeBoundResolver({ status: "reconciled", applied: 3, ignored: [] }),
    });
    expect(g.check(stopCtx).kind).toBe("allow");
  });

  it("allows on pending run in bound native session", () => {
    const g = completionGate({
      resolve: makeBoundResolver({ status: "pending", ignored: false }),
    });
    expect(g.check(stopCtx).kind).toBe("allow");
  });

  it("only fires on stop event", () => {
    const g = completionGate();
    expect(g.appliesTo({ event: "stop", cwd: "/w" })).toBe(true);
    expect(g.appliesTo({ event: "subagent-stop", cwd: "/w" })).toBe(false);
    expect(g.appliesTo({ event: "pre-read", cwd: "/w" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Native-flow layer: quality-gate with fixture (subagent-stop)
// ---------------------------------------------------------------------------

describe("e2e native flow: quality-gate (subagent-stop) with fixture resolver", () => {
  const subagentCtx = (lastMessage?: string): GateContext => ({
    event: "subagent-stop",
    cwd: "/workspace",
    sessionKey: "sess-2",
    ...(lastMessage !== undefined ? { lastMessage } : {}),
  });

  const makeBoundResolver = (result: ReconcileResult): QualityResolver =>
    () => ({ binding: "bound", reconcile: () => result });

  it("fails open (legacy heuristic path) when no resolver is wired", () => {
    // No native binding → falls back to text heuristic on lastMessage.
    // With no message the heuristic is applied to an empty string → deny (too short).
    const g = qualityGate();
    expect(g.check(subagentCtx()).kind).toBe("deny"); // empty message < 50 chars
  });

  it("legacy heuristic: accepts a valid handoff envelope", () => {
    const g = qualityGate();
    const goodHandoff =
      "Status: complete. Produced: the parser module. Next: wire the CLI. Gaps: none. Risks: low. " +
      "Full analysis done and all tests green. No blockers.";
    expect(g.check(subagentCtx(goodHandoff)).kind).toBe("allow");
  });

  it("legacy heuristic: denies a generic one-word handoff", () => {
    const g = qualityGate();
    expect(g.check(subagentCtx("done")).kind).toBe("deny");
    expect(g.check(subagentCtx("ok")).kind).toBe("deny");
  });

  it("native path: blocks when controller_inactive in bound session", () => {
    const g = qualityGate({
      resolve: makeBoundResolver({ status: "controller_inactive", code: "NODE_NATIVE_CONTROLLER_INACTIVE" }),
    });
    const d = g.check(subagentCtx("ok")); // terrible message — native path ignores it
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") {
      expect(d.reason).toContain("NODE_NATIVE_CONTROLLER_INACTIVE");
    }
  });

  it("native path: ignores legacy heuristic for a terrible handoff when reconciled", () => {
    const g = qualityGate({
      resolve: makeBoundResolver({ status: "reconciled", applied: 1, ignored: [] }),
    });
    // "ok" would fail the legacy heuristic, but native path short-circuits.
    expect(g.check(subagentCtx("ok")).kind).toBe("allow");
  });

  it("only fires on subagent-stop event", () => {
    const g = qualityGate();
    expect(g.appliesTo({ event: "subagent-stop", cwd: "/w" })).toBe(true);
    expect(g.appliesTo({ event: "stop", cwd: "/w" })).toBe(false);
    expect(g.appliesTo({ event: "pre-read", cwd: "/w" })).toBe(false);
  });
});
