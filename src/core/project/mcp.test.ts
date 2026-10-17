import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listMcpServers } from "./mcp.js";

describe("listMcpServers", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-mcp-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads servers from .mcp.json and ~/.claude.json, de-duped (project wins)", () => {
    const cwd = join(dir, "proj");
    const home = join(dir, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { gatewright: { command: "gate", args: ["serve"] }, shared: { command: "a" } } }));
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ mcpServers: { other: { command: "b" }, shared: { command: "FROM_USER" } } }));

    const list = listMcpServers({ cwd, home });
    expect(list.map((s) => s.name)).toEqual(["gatewright", "other", "shared"]);
    expect(list.find((s) => s.name === "shared")?.command).toBe("a"); // project wins
    expect(list.find((s) => s.name === "gatewright")?.args).toEqual(["serve"]);
  });

  it("returns empty when nothing is configured and tolerates bad JSON", () => {
    const cwd = join(dir, "empty");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, ".mcp.json"), "{ broken");
    expect(listMcpServers({ cwd, home: cwd })).toEqual([]);
  });
});
