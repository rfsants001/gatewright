import { describe, expect, it } from "vitest";
import { FlowEngine, replayFlow, type FlowInput, type FlowStep } from "./flow.js";
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

// ---------------------------------------------------------------------------
// replayFlow
// ---------------------------------------------------------------------------

/** Minimal two-step flow used across replay tests. */
const replaySteps: FlowStep[] = [
  { id: "plan", kind: "run", title: "Plan", prompt: (c) => `plan ${c.goal}` },
  { id: "implement", kind: "run", title: "Implement", prompt: () => "implement" },
];

/** <gate-ask> block that injects one question when parseQuestions processes it. */
const GATE_ASK_OUTPUT =
  `planning...\n<gate-ask>${JSON.stringify({
    questions: [{ id: "scope", type: "select", prompt: "scope?", options: ["MVP", "Full"] }],
  })}</gate-ask>`;

describe("replayFlow", () => {
  it("reconstructs ask+redo injection — the key bug test", () => {
    // ---- Drive a live engine and record every FlowInput ----
    const live = new FlowEngine(replaySteps, "todo app");
    const recorded: FlowInput[] = [];

    // 1. submitRun with a gate-ask in the output
    const d1 = live.peek();
    expect(d1.type).toBe("run");
    recorded.push({ kind: "run", stepId: (d1 as Extract<typeof d1, { type: "run" }>).step.id, output: GATE_ASK_OUTPUT });
    live.submitRun(GATE_ASK_OUTPUT); // → injects :ask, moves to it

    // 2. submitAnswers for the injected :ask
    const d2 = live.peek();
    expect(d2.type).toBe("ask");
    expect((d2 as Extract<typeof d2, { type: "ask" }>).step.id).toBe("plan:ask");
    const answers = { scope: "Full" as const };
    recorded.push({ kind: "answers", stepId: (d2 as Extract<typeof d2, { type: "ask" }>).step.id, answers });
    live.submitAnswers(answers); // → injects :redo, moves to it

    // Live engine is now at plan:ask:redo (a run step)
    const liveDirective = live.peek();
    expect(liveDirective.type).toBe("run");
    expect((liveDirective as Extract<typeof liveDirective, { type: "run" }>).step.id).toBe("plan:ask:redo");

    // ---- Replay on a fresh engine ----
    const result = replayFlow(replaySteps, "todo app", recorded);
    expect("drift" in result).toBe(false);
    if ("drift" in result) throw new Error("unexpected drift");

    const { engine: replayed } = result;

    // steps() must be identical (same ids in same order — includes injected :ask and :redo)
    expect(replayed.steps().map((s) => s.id)).toEqual(live.steps().map((s) => s.id));

    // index must match
    expect(replayed.index()).toBe(live.index());

    // ctx (outputs + answers) must deep-equal
    expect(replayed.ctx.outputs).toEqual(live.ctx.outputs);
    expect(replayed.ctx.answers).toEqual(live.ctx.answers);
    expect(replayed.ctx.goal).toBe(live.ctx.goal);

    // peek() must return the same directive type and step id
    const replayedDirective = replayed.peek();
    expect(replayedDirective.type).toBe(liveDirective.type);
    if (replayedDirective.type === "run" && liveDirective.type === "run") {
      expect(replayedDirective.step.id).toBe(liveDirective.step.id);
      // The reconstructed prompt must carry the original goal + scope answer
      expect(replayedDirective.prompt).toContain("plan todo app");
      expect(replayedDirective.prompt).toContain("scope: Full");
    }
  });

  it("returns drift when an entry stepId does not match the current directive", () => {
    const result = replayFlow(replaySteps, "todo app", [
      { kind: "run", stepId: "wrong-id", output: "some output" },
    ]);
    expect(result).toEqual({ drift: true, atIndex: 0, expected: "wrong-id", got: "plan" });
  });

  it("replays a simple linear flow (no injections) to the same final state", () => {
    // Drive live
    const live = new FlowEngine(replaySteps, "linear");
    live.submitRun("plan output");
    live.submitRun("implement output");

    // Record
    const entries: FlowInput[] = [
      { kind: "run", stepId: "plan", output: "plan output" },
      { kind: "run", stepId: "implement", output: "implement output" },
    ];

    const result = replayFlow(replaySteps, "linear", entries);
    expect("drift" in result).toBe(false);
    if ("drift" in result) throw new Error("unexpected drift");

    const { engine: replayed } = result;
    expect(replayed.steps().map((s) => s.id)).toEqual(live.steps().map((s) => s.id));
    expect(replayed.index()).toBe(live.index());
    expect(replayed.ctx.outputs).toEqual(live.ctx.outputs);
    expect(replayed.peek()).toEqual({ type: "done" });
  });
});
