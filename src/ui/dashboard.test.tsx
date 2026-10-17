import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { Dashboard } from "./dashboard.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Dashboard", () => {
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

  it("shows the logo + a loading state, then the overview", async () => {
    const { lastFrame, unmount } = render(<Dashboard onAction={() => {}} />);
    // Loading: the logo tagline renders immediately, before detection resolves.
    expect(lastFrame()).toContain("headless guardrails for AI code agents");

    await delay(60);
    const out = lastFrame() ?? "";
    expect(out).toContain("Claude Code");
    expect(out).toContain("Local AI");
    expect(out).toContain("Jev");
    expect(out).toContain("Proxies");
    expect(out).toMatch(/ready|to configure|missing/);
    unmount();
  });
});
