import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { RunScreen } from "./run-screen.js";
import { EngineRegistry } from "../core/engine/registry.js";
import type { ComposerEngine } from "./run-composer.js";

const engines: ComposerEngine[] = [{ id: "claude-code", name: "Claude Code", installed: true, supported: true }];
const noop = () => {};

function renderScreen(over: Partial<Parameters<typeof RunScreen>[0]> = {}) {
  return render(
    <RunScreen
      engines={engines}
      cwd="/tmp/proj"
      mcpConfigPath="/tmp/proj/.gatewright/gate.mcp.json"
      registry={new EngineRegistry()}
      onBack={noop}
      onQuit={noop}
      {...over}
    />,
  );
}

describe("RunScreen (integrated)", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "gw-layout-"));
    process.env.GATEWRIGHT_HOME = home;
  });
  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(home, { recursive: true, force: true });
  });

  it("renders one screen with the composer and transcript area coexisting (no compose→live swap)", () => {
    const { lastFrame } = renderScreen();
    const frame = lastFrame()!;
    // Composer is always present at the bottom…
    expect(frame).toContain("> type a prompt, / for commands");
    // …and the transcript area shows its empty hint on the same screen.
    expect(frame).toContain("type a prompt below to start a run");
  });

  it("shows the status bar with the model label", () => {
    const { lastFrame } = renderScreen();
    expect(lastFrame()).toContain("Claude Code");
  });

  it("shows a detecting hint when engines are not yet known", () => {
    const { lastFrame } = renderScreen({ engines: null });
    expect(lastFrame()).toContain("detecting engines…");
  });
});
