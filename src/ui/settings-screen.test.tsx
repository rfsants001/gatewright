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
const DOWN = "[B";

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
    expect(out).toContain("effective default engine: claude-code");
  });

  it("persists the project default engine on arrow (project overrides gate)", async () => {
    const store = new ConfigStore(new FileArtifactStore());
    const { stdin } = render(<SettingsScreen cwd={proj} engineIds={["claude-code", "codex"]} onBack={noop} onQuit={noop} store={store} />);
    stdin.write(DOWN); // (none) → claude-code, saved to project scope (default focus)
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
