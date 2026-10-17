import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { ProvisionScreen } from "./provision-screen.js";
import type { provision as ProvisionFn } from "../core/provision/provisioner.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DOWN = "[B";
const ENTER = "\r";
const noop = () => {};
const probe = () => null; // nothing installed

function fakeRun(): { fn: typeof ProvisionFn; calls: { id: string; params: Record<string, string> }[] } {
  const calls: { id: string; params: Record<string, string> }[] = [];
  const fn: typeof ProvisionFn = async (tool, params, deps) => {
    calls.push({ id: tool.id, params });
    deps?.onStep?.({ step: { label: "step", command: "", args: [] }, ok: true, output: "done" });
    return { ok: true, outcomes: [] };
  };
  return { fn, calls };
}

describe("ProvisionScreen", () => {
  it("lists the catalog tools and a custom option", () => {
    const out = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fakeRun().fn} />).lastFrame() ?? "";
    expect(out).toContain("Ollama");
    expect(out).toContain("LiteLLM");
    expect(out).toContain("graphify");
    expect(out).toContain("Custom package");
  });

  it("provisions Ollama with the prefilled default model on enter", async () => {
    const { fn, calls } = fakeRun();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fn} />);
    stdin.write(ENTER); // select Ollama (index 0) → model input prefilled with default
    await delay(20);
    expect(lastFrame() ?? "").toContain("Model for Ollama");
    stdin.write(ENTER); // accept default
    await delay(20);
    expect(calls[0]).toEqual({ id: "ollama", params: { model: "llama3.2" } });
    expect(lastFrame() ?? "").toContain("Installing Ollama");
  });

  it("runs a pasted custom install command", async () => {
    const { fn, calls } = fakeRun();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fn} />);
    stdin.write(DOWN); // → litellm
    await delay(10);
    stdin.write(DOWN); // → graphify
    await delay(10);
    stdin.write(DOWN); // → custom
    await delay(10);
    stdin.write(ENTER); // select custom
    await delay(20);
    expect(lastFrame() ?? "").toContain("Install command (pasted)");
    stdin.write("cargo install ripgrep");
    await delay(20);
    stdin.write(ENTER);
    await delay(20);
    expect(calls[0]?.id).toBe("cargo");
  });
});
