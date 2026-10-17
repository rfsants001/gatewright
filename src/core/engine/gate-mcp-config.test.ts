import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGateMcpConfig, GATE_MCP_CONFIG_RELPATH } from "./gate-mcp-config.js";

describe("ensureGateMcpConfig", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-mcp-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes a config with only the gate server", () => {
    const path = ensureGateMcpConfig(dir);
    expect(path).toBe(join(dir, GATE_MCP_CONFIG_RELPATH));
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(cfg.mcpServers)).toEqual(["gatewright"]);
    expect(typeof cfg.mcpServers.gatewright.command).toBe("string");
  });

  it("is idempotent — does not rewrite when content is already correct", () => {
    const path = ensureGateMcpConfig(dir);
    const past = new Date(Date.now() - 60_000);
    utimesSync(path, past, past);
    const before = statSync(path).mtimeMs;
    ensureGateMcpConfig(dir);
    expect(statSync(path).mtimeMs).toBe(before);
  });
});
