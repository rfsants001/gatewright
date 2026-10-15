import { describe, expect, it } from "vitest";
import type { GateContext } from "../core/gate/types.js";
import type { ReconcileResult } from "../core/reconcile/native-node-reconciler.js";
import { qualityGate, type QualityResolver } from "./quality-gate.js";

const ctx = (lastMessage?: string): GateContext => ({
  event: "subagent-stop",
  cwd: "/ws",
  ...(lastMessage !== undefined ? { lastMessage } : {}),
});

const boundResolver = (result: ReconcileResult): QualityResolver => () => ({
  binding: "bound",
  reconcile: () => result,
});

describe("quality-gate — native path", () => {
  it("blocks on controller_inactive", () => {
    const g = qualityGate({ resolve: boundResolver({ status: "controller_inactive", code: "NODE_NATIVE_CONTROLLER_INACTIVE" }) });
    const d = g.check(ctx("whatever the subagent said, long enough to otherwise pass the heuristic cleanly"));
    expect(d.kind).toBe("deny");
    expect(d.kind === "deny" && d.reason).toContain("NODE_NATIVE_CONTROLLER_INACTIVE");
  });

  it("accepts reconciled/pending without running the text heuristic", () => {
    const reconciled = qualityGate({ resolve: boundResolver({ status: "reconciled", applied: 1, ignored: [] }) });
    const pending = qualityGate({ resolve: boundResolver({ status: "pending", ignored: false }) });
    // lastMessage is terrible ("ok") — would fail the legacy heuristic, but native path ignores it.
    expect(reconciled.check(ctx("ok")).kind).toBe("allow");
    expect(pending.check(ctx("ok")).kind).toBe("allow");
  });
});

describe("quality-gate — legacy heuristic (no native binding)", () => {
  const g = qualityGate();
  it("denies too-short handoffs", () => {
    expect(g.check(ctx("done")).kind).toBe("deny");
  });
  it("denies generic handoffs", () => {
    expect(g.check(ctx("ok")).kind).toBe("deny");
    expect(g.check(ctx("nenhum resultado")).kind).toBe("deny");
  });
  it("denies long handoffs with no envelope", () => {
    const d = g.check(ctx("x".repeat(260)));
    expect(d.kind).toBe("deny");
    expect(d.kind === "deny" && d.reason).toContain("Handoff Envelope");
  });
  it("accepts a handoff with envelope signals", () => {
    expect(g.check(ctx(`Status: done. Produced the parser. Next: wire the CLI. Gaps: none. Risks: low. ${"detail ".repeat(30)}`)).kind).toBe("allow");
  });
});
