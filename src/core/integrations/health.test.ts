import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import {
  integrationRevision,
  readHealth,
  recordHealthAttempt,
} from "./health.js";

// ---------------------------------------------------------------------------
// Setup: each test gets an isolated temp cwd + GATEWRIGHT_HOME
// ---------------------------------------------------------------------------

let cwd: string;
const configs = new ConfigStore(new FileArtifactStore());

beforeEach(() => {
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "gw-health-")));
  process.env["GATEWRIGHT_HOME"] = join(cwd, "gate-home");
});

afterEach(() => {
  delete process.env["GATEWRIGHT_HOME"];
  vi.restoreAllMocks();
  rmSync(cwd, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper: register a minimal stdio MCP entry in project config
// ---------------------------------------------------------------------------

function registerMcp(name: string): void {
  configs.write(
    "project",
    {
      modules: [
        {
          id: `mcp-${name}`,
          kind: "mcp",
          provider: "external",
          enabled: true,
          config: { type: "stdio", command: "/usr/bin/node", args: ["server.js"] },
        },
      ],
    },
    cwd,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("readHealth — never attempted", () => {
  it("returns verification:never + actions:[test] when no attempt recorded", () => {
    registerMcp("my-server");
    const h = readHealth(cwd, "my-server");
    expect(h.verification).toBe("never");
    expect(h.actions).toContain("test");
    expect(h.lastAttemptAt).toBeUndefined();
    expect(h.latencyMs).toBeUndefined();
  });

  it("configured:false when server not registered", () => {
    const h = readHealth(cwd, "nonexistent");
    expect(h.configured).toBe(false);
    expect(h.verification).toBe("never");
  });
});

describe("recordHealthAttempt + readHealth — passed", () => {
  it("persists passed attempt and reads back passed + latencyMs + lastAttemptAt", () => {
    registerMcp("alpha");
    const rev = integrationRevision(cwd, "alpha");

    recordHealthAttempt(cwd, "alpha", {
      verification: "passed",
      latencyMs: 42,
      checkedRevision: rev,
    });

    const h = readHealth(cwd, "alpha");
    expect(h.verification).toBe("passed");
    expect(h.latencyMs).toBe(42);
    expect(typeof h.lastAttemptAt).toBe("string");
    expect(h.actions).toEqual([]);
    expect(h.errorCode).toBeUndefined();
  });
});

describe("recordHealthAttempt + readHealth — failed", () => {
  it("persists failed attempt: verification:failed, errorCode, actions:['retry']", () => {
    registerMcp("beta");
    const rev = integrationRevision(cwd, "beta");

    recordHealthAttempt(cwd, "beta", {
      verification: "failed",
      errorCode: "timeout",
      checkedRevision: rev,
    });

    const h = readHealth(cwd, "beta");
    expect(h.verification).toBe("failed");
    expect(h.errorCode).toBe("timeout");
    expect(h.actions).toContain("retry");
    expect(h.latencyMs).toBeUndefined();
  });
});

describe("evidence expiry — revision mismatch", () => {
  it("degrades to verification:unknown when integration config changes after a passed attempt", () => {
    registerMcp("gamma");
    const rev = integrationRevision(cwd, "gamma");

    recordHealthAttempt(cwd, "gamma", {
      verification: "passed",
      latencyMs: 10,
      checkedRevision: rev,
    });

    // Confirm it reads back as passed before mutation.
    expect(readHealth(cwd, "gamma").verification).toBe("passed");

    // Mutate the integration config (change args → new revision).
    configs.write(
      "project",
      {
        modules: [
          {
            id: "mcp-gamma",
            kind: "mcp",
            provider: "external",
            enabled: true,
            config: { type: "stdio", command: "/usr/bin/node", args: ["server.js", "--new-flag"] },
          },
        ],
      },
      cwd,
    );

    // Now the stored checkedRevision no longer matches → evidence expired.
    const h = readHealth(cwd, "gamma");
    expect(h.verification).toBe("unknown");
    expect(h.actions).toContain("test");
    // latencyMs from prior attempt still present in store but verification is unknown
    expect(h.latencyMs).toBe(10);
  });
});

describe("multiple attempts — latest wins", () => {
  it("second record overwrites the first for the same name", () => {
    registerMcp("delta");
    const rev = integrationRevision(cwd, "delta");

    recordHealthAttempt(cwd, "delta", { verification: "failed", errorCode: "transport", checkedRevision: rev });
    recordHealthAttempt(cwd, "delta", { verification: "passed", latencyMs: 55, checkedRevision: rev });

    const h = readHealth(cwd, "delta");
    expect(h.verification).toBe("passed");
    expect(h.latencyMs).toBe(55);
    expect(h.errorCode).toBeUndefined();
  });
});

describe("missing/corrupt store — safe defaults", () => {
  it("readHealth never throws even with absent store", () => {
    expect(() => readHealth(cwd, "absent")).not.toThrow();
    const h = readHealth(cwd, "absent");
    expect(h.verification).toBe("never");
  });
});
