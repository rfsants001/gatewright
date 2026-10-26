import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { ProvisionScreen } from "./provision-screen.js";
import type { provision as ProvisionFn } from "../core/provision/provisioner.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DOWN = "[B";
const ENTER = "\r";
const noop = () => {};
const probe = () => null; // nothing installed

function fakeRun(): { fn: typeof ProvisionFn; calls: { id: string; params: Record<string, string>; scope: string }[] } {
  const calls: { id: string; params: Record<string, string>; scope: string }[] = [];
  const fn: typeof ProvisionFn = async (tool, params, deps) => {
    calls.push({ id: tool.id, params, scope: tool.scope });
    deps?.onStep?.({ step: { label: "step", command: "", args: [] }, ok: true, output: "done" });
    return { ok: true, outcomes: [] };
  };
  return { fn, calls };
}

describe("ProvisionScreen", () => {
  it("lists the catalog tools, an AI-install and a custom option", () => {
    const out = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fakeRun().fn} />).lastFrame() ?? "";
    expect(out).toContain("Ollama");
    expect(out).toContain("LiteLLM");
    expect(out).toContain("graphify");
    expect(out).toContain("Install with AI");
    expect(out).toContain("Custom package");
  });

  it("hands a repo URL to onAiInstall", async () => {
    const onAiInstall = vi.fn();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fakeRun().fn} onAiInstall={onAiInstall} />);
    // list: ollama, litellm, graphify, AI(3), custom(4) → 3 downs to reach AI
    for (let i = 0; i < 3; i++) {
      stdin.write(DOWN);
      await delay(10);
    }
    stdin.write(ENTER); // select "Install with AI"
    await delay(20);
    expect(lastFrame() ?? "").toContain("Repo URL or tool name");
    stdin.write("https://github.com/owner/repo");
    await delay(20);
    stdin.write(ENTER);
    await delay(20);
    expect(onAiInstall).toHaveBeenCalledWith("https://github.com/owner/repo");
  });

  it("provisions Ollama with the prefilled default model on enter", async () => {
    const { fn, calls } = fakeRun();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fn} />);
    stdin.write(ENTER); // select Ollama (index 0) → model input prefilled with default
    await delay(20);
    expect(lastFrame() ?? "").toContain("Model for Ollama");
    stdin.write(ENTER); // accept default
    await delay(20);
    expect(calls[0]).toMatchObject({ id: "ollama", params: { model: "llama3.2" } });
    expect(lastFrame() ?? "").toContain("install · Ollama");
  });

  it("runs a pasted custom install command", async () => {
    const { fn, calls } = fakeRun();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fn} />);
    stdin.write(DOWN); // → litellm
    await delay(10);
    stdin.write(DOWN); // → graphify
    await delay(10);
    stdin.write(DOWN); // → AI
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
    expect(calls[0]?.scope).toBe("project"); // default scope
  });

  it("lets a custom install record at the gate scope via tab", async () => {
    const { fn, calls } = fakeRun();
    const { stdin, lastFrame } = render(<ProvisionScreen cwd="/p" onBack={noop} onQuit={noop} probe={probe} run={fn} />);
    for (let i = 0; i < 4; i++) {
      stdin.write(DOWN); // ollama→litellm→graphify→AI→custom
      await delay(10);
    }
    stdin.write(ENTER); // custom
    await delay(20);
    expect(lastFrame() ?? "").toContain("record in: project");
    stdin.write("\t"); // toggle scope → gate
    await delay(20);
    expect(lastFrame() ?? "").toContain("record in: gate");
    stdin.write("npm i -g graphify");
    await delay(20);
    stdin.write(ENTER);
    await delay(20);
    expect(calls[0]?.scope).toBe("gate");
  });
});
