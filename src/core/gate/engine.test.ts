import { describe, expect, it } from "vitest";
import type { Gate, GateContext, GateDecision } from "./types.js";
import { runGates } from "./engine.js";

const ctx: GateContext = { event: "pre-bash", cwd: "/x" };

function gate(
  name: string,
  opts: { applies?: boolean; decision?: GateDecision; throwOn?: "applies" | "check" } = {},
): Gate {
  const { applies = true, decision = { kind: "allow" }, throwOn } = opts;
  return {
    name,
    description: name,
    events: ["pre-bash"],
    appliesTo: () => {
      if (throwOn === "applies") throw new Error("boom-applies");
      return applies;
    },
    check: () => {
      if (throwOn === "check") throw new Error("boom-check");
      return decision;
    },
  };
}

describe("runGates", () => {
  it("allows when no gate acts", () => {
    expect(runGates([gate("a"), gate("b")], ctx).decision).toEqual({ kind: "allow" });
  });

  it("skips gates that do not apply", () => {
    const res = runGates([gate("skip", { applies: false, decision: { kind: "deny", reason: "nope" } })], ctx);
    expect(res.decision).toEqual({ kind: "allow" });
  });

  it("deny dominates and reports the source", () => {
    const res = runGates(
      [gate("a", { decision: { kind: "advise", message: "m" } }), gate("blocker", { decision: { kind: "deny", reason: "stop" } })],
      ctx,
    );
    expect(res.decision).toEqual({ kind: "deny", reason: "stop" });
    expect(res.deniedBy).toBe("blocker");
  });

  it("first deny wins (short-circuit, registration order)", () => {
    const res = runGates(
      [gate("first", { decision: { kind: "deny", reason: "one" } }), gate("second", { decision: { kind: "deny", reason: "two" } })],
      ctx,
    );
    expect(res.deniedBy).toBe("first");
  });

  it("concatenates advise messages", () => {
    const res = runGates(
      [gate("a", { decision: { kind: "advise", message: "first" } }), gate("b", { decision: { kind: "advise", message: "second" } })],
      ctx,
    );
    expect(res.decision).toEqual({ kind: "advise", message: "first\n\nsecond" });
  });

  it("is fail-open: a throwing gate is isolated and recorded", () => {
    const res = runGates([gate("boom", { throwOn: "check" }), gate("ok", { decision: { kind: "advise", message: "m" } })], ctx);
    expect(res.decision).toEqual({ kind: "advise", message: "m" });
    expect(res.errors).toEqual([{ gate: "boom", error: "boom-check" }]);
  });
});
