import { describe, expect, it } from "vitest";
import type { GateContext } from "../core/gate/types.js";
import type { ReconcileResult } from "../core/reconcile/native-node-reconciler.js";
import { completionGate, type CompletionResolver } from "./completion-gate.js";

const ctx = (): GateContext => ({ event: "stop", cwd: "/ws" });

const boundResolver = (result: ReconcileResult): CompletionResolver => () => ({
  binding: "bound",
  reconcile: () => result,
});

describe("completion-gate", () => {
  it("fails open when no run-state is wired", () => {
    expect(completionGate().check(ctx()).kind).toBe("allow");
  });

  it("fails open when the session is not bound to a native run", () => {
    const g = completionGate({ resolve: () => ({ binding: "unbound", reconcile: () => ({ status: "pending", ignored: false }) }) });
    expect(g.check(ctx()).kind).toBe("allow");
  });

  it("blocks on controller_inactive in the native flow", () => {
    const g = completionGate({ resolve: boundResolver({ status: "controller_inactive", code: "NODE_NATIVE_CONTROLLER_INACTIVE" }) });
    const d = g.check(ctx());
    expect(d.kind).toBe("deny");
    expect(d.kind === "deny" && d.reason).toContain("NODE_NATIVE_CONTROLLER_INACTIVE");
  });

  it("accepts a reconciled run", () => {
    const g = completionGate({ resolve: boundResolver({ status: "reconciled", applied: 2, ignored: [] }) });
    expect(g.check(ctx()).kind).toBe("allow");
  });
});
