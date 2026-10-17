import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { App } from "./app.js";
import { HomeView, type DashboardData } from "./dashboard.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

const homeData: DashboardData = {
  report: { groups: [] } as unknown as DashboardData["report"],
  cc: {} as unknown as DashboardData["cc"],
  agents: [{ id: "claude-code", name: "Claude Code", installed: true, summary: "ready" }],
  proxies: [],
  hasHistory: false,
};

describe("TUI app (dashboard SPA)", () => {
  beforeEach(() => {
    // Keep detection hermetic/fast: no real network for Ollama/LM Studio.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline in test");
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the logo + loading, then the overview with an agents panel and actions", async () => {
    const { lastFrame, unmount } = render(<App onExit={() => {}} />);
    expect(lastFrame()).toContain("headless guardrails for AI code agents");

    await delay(60);
    const out = lastFrame() ?? "";
    expect(out).toContain("AI agents");
    expect(out).toContain("Claude Code");
    expect(out).toContain("Actions");
    expect(out).toContain("Local AI");
    expect(out).toMatch(/ready|to configure|missing/);
    unmount();
  });

  it("offers Run through the gate as primary and raw launch as the escape hatch", () => {
    const out = render(
      <HomeView data={homeData} agentIndex={0} onAgentMove={noop} onOpenAgent={noop} onNavigate={noop} onLaunch={noop} onRefresh={noop} onQuit={noop} />,
    ).lastFrame() ?? "";
    expect(out).toContain("Run an agent");
    expect(out).toContain("through the gate");
    expect(out).toContain("Launch raw (no gate)");
  });

  it("navigates into the agent detail on enter and back", async () => {
    const { lastFrame, stdin, unmount } = render(<App onExit={() => {}} />);
    await delay(60);
    stdin.write("\r"); // enter → open selected agent (Claude Code) detail
    await delay(20);
    expect(lastFrame()).toContain("Claude Code · detail");
    stdin.write("b"); // back
    await delay(20);
    expect(lastFrame()).toContain("AI agents");
    unmount();
  });
});
