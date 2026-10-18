import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { FlowScreen, type RunEngine } from "./flow-screen.js";
import type { FlowStep } from "../core/flow/flow.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENTER = "\r";

/** A fake engine that emits one assistant event and resolves with a scripted output. */
function fakeEngine(outputs: Record<string, string>): RunEngine {
  return (prompt, handlers) => {
    const key = Object.keys(outputs).find((k) => prompt.includes(k)) ?? "";
    const output = outputs[key] ?? "ok";
    handlers.onEvent({ kind: "assistant", text: output });
    handlers.onState("PASSED");
    return { done: Promise.resolve(output), cancel: () => {} };
  };
}

const steps: FlowStep[] = [
  { id: "plan", kind: "run", title: "Plan", prompt: () => "do PLAN" },
  { id: "signoff", kind: "gate", title: "Sign off", questions: () => [{ id: "approve", type: "confirm", prompt: "Approve?" }] },
  { id: "implement", kind: "run", title: "Implement", prompt: () => "do IMPLEMENT" },
];

describe("FlowScreen", () => {
  it("runs → shows the sign-off gate → on approval runs the next step → done", async () => {
    const onDone = vi.fn();
    const { stdin, lastFrame } = render(<FlowScreen goal="x" steps={steps} runEngine={fakeEngine({ PLAN: "planned", IMPLEMENT: "built" })} onDone={onDone} />);
    await delay(120);
    // plan run resolved → review of the plan output shown first
    expect(lastFrame() ?? "").toContain("Review");
    expect(lastFrame() ?? "").toContain("planned");
    stdin.write(ENTER); // continue past review → gate
    await delay(60);
    expect(lastFrame() ?? "").toContain("Sign off");
    expect(lastFrame() ?? "").toContain("Approve?");
    stdin.write(ENTER); // Yes (confirm) → approve → runs implement → done
    await delay(120);
    expect(lastFrame() ?? "").toContain("Flow finished");
  });

  it("stops when the gate is declined", async () => {
    const steps2: FlowStep[] = [
      { id: "plan", kind: "run", title: "Plan", prompt: () => "do PLAN" },
      { id: "signoff", kind: "gate", title: "Sign off", questions: () => [{ id: "approve", type: "confirm", prompt: "Approve?" }] },
    ];
    const { stdin, lastFrame } = render(<FlowScreen goal="x" steps={steps2} runEngine={fakeEngine({ PLAN: "planned" })} onDone={vi.fn()} />);
    await delay(120);
    stdin.write(ENTER); // continue past the review of the plan output
    await delay(60);
    stdin.write("[B"); // move to "No"
    await delay(60);
    stdin.write(ENTER); // decline
    await delay(120);
    expect(lastFrame() ?? "").toContain("declined a gate");
  });

  it("injects a question when a run emits <gate-ask>", async () => {
    const ask = `<gate-ask>${JSON.stringify({ questions: [{ id: "scope", type: "select", prompt: "Scope?", options: ["MVP", "Full"] }] })}</gate-ask>`;
    const { lastFrame } = render(<FlowScreen goal="x" steps={[{ id: "plan", kind: "run", title: "Plan", prompt: () => "do PLAN" }]} runEngine={fakeEngine({ PLAN: ask })} onDone={vi.fn()} />);
    await delay(120);
    // a bare gate-ask has no prose to review → the question is shown straight away
    expect(lastFrame() ?? "").toContain("Scope?");
  });

  it("reviews the prose but hides the raw gate-ask block, then shows the question", async () => {
    const q = JSON.stringify({ questions: [{ id: "scope", type: "select", prompt: "Scope?", options: ["MVP", "Full"] }] });
    const out = `Here is my reasoning for RICHES.\n<gate-ask>${q}</gate-ask>`;
    const { stdin, lastFrame } = render(<FlowScreen goal="x" steps={[{ id: "plan", kind: "run", title: "Plan", prompt: () => "do PLAN" }]} runEngine={fakeEngine({ PLAN: out })} onDone={vi.fn()} />);
    await delay(120);
    // review shows the prose, not the XML or the question yet
    expect(lastFrame() ?? "").toContain("RICHES");
    expect(lastFrame() ?? "").not.toContain("gate-ask");
    expect(lastFrame() ?? "").not.toContain("Scope?");
    stdin.write(ENTER); // continue past review → the injected question
    await delay(60);
    expect(lastFrame() ?? "").toContain("Scope?");
  });
});
