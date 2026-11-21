import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { FlowScreen, type RunEngine } from "./flow-screen.js";
import type { FlowStep } from "../core/flow/flow.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENTER = "\r";

// Ink commits input subscriptions after painting. Under suite-wide CPU load a
// painted review can precede its input effect. The review's `a` shortcut is safe
// to repeat: it never approves the next question (which only accepts Enter).
async function continueReview(stdin: { write: (value: string) => void }, lastFrame: () => string | undefined, prompt: string) {
  await vi.waitFor(() => {
    if (!(lastFrame() ?? "").includes(prompt)) stdin.write("a");
    expect(lastFrame() ?? "").toContain(prompt);
  }, { timeout: 2000, interval: 40 });
}

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
    expect(lastFrame() ?? "").toContain("review ·");
    expect(lastFrame() ?? "").toContain("planned");
    await continueReview(stdin, lastFrame, "Approve?");
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
    await continueReview(stdin, lastFrame, "Approve?");
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
    await continueReview(stdin, lastFrame, "Scope?");
  });
});
