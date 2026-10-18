import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { AskPrompts } from "./ask-prompt.js";
import type { Question } from "../core/flow/questions.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENTER = "\r";
const SPACE = " ";
const DOWN = "[B";

describe("AskPrompts", () => {
  it("collects a text answer then a select answer across questions", async () => {
    const onComplete = vi.fn();
    const questions: Question[] = [
      { id: "goal", type: "text", prompt: "What to build?" },
      { id: "scope", type: "select", prompt: "Scope?", options: ["MVP", "Full"] },
    ];
    const { stdin, lastFrame } = render(<AskPrompts questions={questions} onComplete={onComplete} />);
    expect(lastFrame() ?? "").toContain("What to build?");
    expect(lastFrame() ?? "").toContain("1/2");
    stdin.write("a todo app");
    await delay(20);
    stdin.write(ENTER); // submit text → next question
    await delay(20);
    expect(lastFrame() ?? "").toContain("Scope?");
    stdin.write(DOWN); // MVP → Full
    await delay(20);
    stdin.write(ENTER); // choose Full
    await delay(20);
    expect(onComplete).toHaveBeenCalledWith({ goal: "a todo app", scope: "Full" });
  });

  it("collects a multiselect answer", async () => {
    const onComplete = vi.fn();
    const questions: Question[] = [{ id: "areas", type: "multiselect", prompt: "Areas?", options: ["api", "ui", "db"] }];
    const { stdin } = render(<AskPrompts questions={questions} onComplete={onComplete} />);
    stdin.write(SPACE); // toggle first (api)
    await delay(20);
    stdin.write(ENTER); // submit
    await delay(20);
    expect(onComplete).toHaveBeenCalledWith({ areas: ["api"] });
  });

  it("confirm returns a boolean", async () => {
    const onComplete = vi.fn();
    const { stdin } = render(<AskPrompts questions={[{ id: "ship", type: "confirm", prompt: "Ship?" }]} onComplete={onComplete} />);
    stdin.write(ENTER); // Yes is first
    await delay(20);
    expect(onComplete).toHaveBeenCalledWith({ ship: true });
  });

  it("esc cancels when a handler is provided", async () => {
    const onCancel = vi.fn();
    const { stdin } = render(<AskPrompts questions={[{ id: "x", type: "text", prompt: "hi" }]} onComplete={vi.fn()} onCancel={onCancel} />);
    stdin.write("\x1B");
    await delay(20);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
