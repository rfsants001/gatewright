import { describe, expect, it } from "vitest";
import { FlowEngine, type FlowStep } from "./flow.js";
import { buildSddFlow } from "./sdd-flow.js";

const steps: FlowStep[] = [
  { id: "plan", kind: "run", title: "Plan", prompt: (c) => `plan ${c.goal}` },
  { id: "signoff", kind: "gate", title: "Sign off", questions: () => [{ id: "approve", type: "confirm", prompt: "ok?" }] },
  { id: "implement", kind: "run", title: "Implement", prompt: () => "implement" },
];

describe("FlowEngine", () => {
  it("walks run → gate → run and completes", () => {
    const f = new FlowEngine(steps, "a todo app");
    expect(f.peek()).toMatchObject({ type: "run", prompt: "plan a todo app" });
    expect(f.submitRun("spec done")).toMatchObject({ type: "ask", step: { id: "signoff" } });
    expect(f.ctx.outputs["plan"]).toBe("spec done");
    expect(f.submitAnswers({ approve: true })).toMatchObject({ type: "run", prompt: "implement" });
    expect(f.submitRun("implemented")).toMatchObject({ type: "done" });
  });

  it("aborts when a gate confirm is declined", () => {
    const f = new FlowEngine(steps, "x");
    f.submitRun("spec");
    expect(f.submitAnswers({ approve: false })).toEqual({ type: "done", aborted: true });
  });

  it("injects an ask when a run emits <gate-ask>, then re-runs with the answers", () => {
    const f = new FlowEngine(steps, "x");
    const out = `planning...\n<gate-ask>${JSON.stringify({ questions: [{ id: "scope", type: "select", prompt: "scope?", options: ["MVP", "Full"] }] })}</gate-ask>`;
    const afterRun = f.submitRun(out);
    expect(afterRun).toMatchObject({ type: "ask", step: { id: "plan:ask" } });
    const afterAns = f.submitAnswers({ scope: "Full" });
    expect(afterAns.type).toBe("run");
    if (afterAns.type === "run") {
      expect(afterAns.step.id).toBe("plan:ask:redo");
      expect(afterAns.prompt).toContain("scope: Full");
      expect(afterAns.prompt).toContain("plan x"); // original prompt carried forward
    }
  });
});

describe("buildSddFlow", () => {
  it("is goal→plan, sign-off, implement, review, confirm, ship with two human gates", () => {
    const s = buildSddFlow();
    expect(s.map((x) => x.id)).toEqual(["plan", "signoff", "implement", "review", "confirm-ship", "ship"]);
    expect(s.filter((x) => x.kind === "gate").map((x) => x.id)).toEqual(["signoff", "confirm-ship"]);
    const ship = s.find((x) => x.id === "ship")!;
    expect(ship.prompt!({ goal: "g", answers: {}, outputs: {} })).toMatch(/gate-ask.*confirm|confirm.*PR/is);
  });
});
