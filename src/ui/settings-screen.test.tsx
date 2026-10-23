import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore } from "../core/config/config-store.js";
import { SettingsScreen } from "./settings-screen.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};
const DOWN = "\x1b[B";
const ENTER = "\r";

describe("SettingsScreen", () => {
  let gate: string;
  let proj: string;
  beforeEach(() => {
    gate = mkdtempSync(join(tmpdir(), "gw-set-gate-"));
    proj = mkdtempSync(join(tmpdir(), "gw-set-proj-"));
    process.env.GATEWRIGHT_HOME = gate;
  });
  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(gate, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  it("shows both scopes and the effective value", () => {
    const store = new ConfigStore(new FileArtifactStore());
    store.write("gate", { defaultEngine: "claude-code" }, proj);
    const out = render(<SettingsScreen cwd={proj} engineIds={["claude-code", "codex"]} onBack={noop} onQuit={noop} store={store} />).lastFrame() ?? "";
    expect(out).toContain("Gate (global)");
    expect(out).toContain("Project (this folder)");
    expect(out).toContain("effective:");
    expect(out).toContain("claude-code");
  });

  it("persists the project default engine on select (down to pick, enter to confirm)", async () => {
    const store = new ConfigStore(new FileArtifactStore());
    const { stdin } = render(<SettingsScreen cwd={proj} engineIds={["claude-code", "codex"]} onBack={noop} onQuit={noop} store={store} />);
    stdin.write(DOWN); // cursor: (none) → claude-code
    await delay(20);
    stdin.write(ENTER); // confirm → saved to project scope
    await delay(20);
    expect(store.read("project", proj).defaultEngine).toBe("claude-code");
  });

  it("goes back on 'b'", async () => {
    const onBack = vi.fn();
    const { stdin } = render(<SettingsScreen cwd={proj} engineIds={["claude-code"]} onBack={onBack} onQuit={noop} />);
    stdin.write("b");
    await delay(20);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
