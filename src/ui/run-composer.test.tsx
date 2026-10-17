import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { buildRunOptions, RunComposer, type ComposerEngine } from "./run-composer.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TAB = "\t";
const ENTER = "\r";

const engines: ComposerEngine[] = [
  { id: "claude-code", name: "Claude Code", installed: true, supported: true },
  { id: "codex", name: "Codex", installed: true, supported: false },
  { id: "opencode", name: "OpenCode", installed: false, supported: false },
];

describe("buildRunOptions", () => {
  it("trims the prompt and splits context dirs", () => {
    const { engineId, options } = buildRunOptions("  do it  ", "claude-code", "src, docs", { cwd: "/p", mcpConfigPath: "/p/m.json" });
    expect(engineId).toBe("claude-code");
    expect(options).toEqual({ prompt: "do it", cwd: "/p", mcpConfigPath: "/p/m.json", contextDirs: ["src", "docs"] });
  });
  it("omits contextDirs when empty", () => {
    expect(buildRunOptions("x", "claude-code", "   ", { cwd: "/p", mcpConfigPath: "/m" }).options.contextDirs).toBeUndefined();
  });
});

describe("RunComposer", () => {
  const noop = () => {};

  it("shows unavailable engines with a reason", () => {
    const { lastFrame } = render(<RunComposer engines={engines} cwd="/p" mcpConfigPath="/m" onRun={noop} onBack={noop} onQuit={noop} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("Codex");
    expect(out).toContain("not yet supported");
    expect(out).toContain("not installed");
  });

  it("emits run options with the typed prompt and default engine", async () => {
    const onRun = vi.fn();
    const { stdin } = render(<RunComposer engines={engines} cwd="/p" mcpConfigPath="/p/m.json" onRun={onRun} onBack={noop} onQuit={noop} />);
    stdin.write("fix the bug");
    await delay(20);
    stdin.write(TAB); // prompt → engine
    stdin.write(TAB); // engine → context
    stdin.write(TAB); // context → run
    await delay(20);
    stdin.write(ENTER); // run
    await delay(20);
    expect(onRun).toHaveBeenCalledWith("claude-code", expect.objectContaining({ prompt: "fix the bug", mcpConfigPath: "/p/m.json" }));
  });

  it("warns when the selected engine has no login (F9-007)", () => {
    const out = render(
      <RunComposer
        engines={[{ id: "claude-code", name: "Claude Code", installed: true, supported: true, loggedOut: true }]}
        cwd="/p"
        mcpConfigPath="/m"
        onRun={noop}
        onBack={noop}
        onQuit={noop}
      />,
    ).lastFrame() ?? "";
    expect(out).toContain("no login");
  });

  it("does not run with an empty prompt", async () => {
    const onRun = vi.fn();
    const { stdin } = render(<RunComposer engines={engines} cwd="/p" mcpConfigPath="/m" onRun={onRun} onBack={noop} onQuit={noop} />);
    stdin.write(TAB);
    stdin.write(TAB);
    stdin.write(TAB);
    await delay(20);
    stdin.write(ENTER);
    await delay(20);
    expect(onRun).not.toHaveBeenCalled();
  });
});
