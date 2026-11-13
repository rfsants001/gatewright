import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerUsageResource, registerConfigResource } from "./resources.js";
import { ENGINE_EVENT_TYPE } from "../core/engine/run-journal.js";
import type { EngineEvent } from "../core/engine/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJournalEntries(
  events: Array<{ tokensIn: number; tokensOut: number; cacheRead: number; model?: string }>,
): string {
  return JSON.stringify(
    events.map((e, i) => ({
      type: ENGINE_EVENT_TYPE,
      payload: {
        kind: "usage",
        usage: { tokensIn: e.tokensIn, tokensOut: e.tokensOut, cacheRead: e.cacheRead },
        raw: e.model ? { model: e.model } : undefined,
      } satisfies EngineEvent,
      at: new Date().toISOString(),
      prevHash: i === 0 ? "0000000000000000000000000000000000000000000000000000000000000000" : `h${i - 1}`,
      hash: `h${i}`,
    })),
  );
}

function makeCwdWithUsage(runs: Array<{ slug: string; tokensIn: number; tokensOut: number; model?: string }>): string {
  const cwd = mkdtempSync(join(tmpdir(), "resources-test-"));
  for (const run of runs) {
    const dir = join(cwd, ".gatewright", "runs", run.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "journal.json"),
      makeJournalEntries([{ tokensIn: run.tokensIn, tokensOut: run.tokensOut, cacheRead: 0, ...(run.model === undefined ? {} : { model: run.model }) }]),
    );
  }
  return cwd;
}

async function connectWithResources(setup: (server: McpServer) => void) {
  const server = new McpServer({ name: "test-resources", version: "0" });
  setup(server);
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ── gate://usage ─────────────────────────────────────────────────────────────

describe("registerUsageResource", () => {
  it("lists gate://usage as a resource", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "res-empty-"));
    const { client, close } = await connectWithResources((s) => registerUsageResource(s, cwd));
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("gate://usage");
    await close();
  });

  it("returns valid JSON with the snapshot shape", async () => {
    const cwd = makeCwdWithUsage([{ slug: "run-001", tokensIn: 100, tokensOut: 50 }]);
    const { client, close } = await connectWithResources((s) => registerUsageResource(s, cwd));
    const result = await client.readResource({ uri: "gate://usage" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe("application/json");
    const text = (result.contents[0] as { text: string }).text;
    const snap = JSON.parse(text) as Record<string, unknown>;
    expect(snap).toHaveProperty("totalTokensIn");
    expect(snap).toHaveProperty("byModel");
    expect(snap).toHaveProperty("byRun");
    await close();
  });

  it("reports the correct aggregated token counts", async () => {
    const cwd = makeCwdWithUsage([
      { slug: "run-a", tokensIn: 100, tokensOut: 50 },
      { slug: "run-b", tokensIn: 200, tokensOut: 80 },
    ]);
    const { client, close } = await connectWithResources((s) => registerUsageResource(s, cwd));
    const result = await client.readResource({ uri: "gate://usage" });
    const snap = JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
    expect(snap["totalTokensIn"]).toBe(300);
    expect(snap["totalTokensOut"]).toBe(130);
    await close();
  });

  it("does not leak cwd (not an ALLOWED_KEY)", async () => {
    const cwd = makeCwdWithUsage([{ slug: "run-a", tokensIn: 10, tokensOut: 5 }]);
    const { client, close } = await connectWithResources((s) => registerUsageResource(s, cwd));
    const result = await client.readResource({ uri: "gate://usage" });
    const snap = JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
    // cwd key is not in ALLOWED_KEYS → must be redacted
    expect(snap["cwd"]).toBe("[REDACTED]");
    await close();
  });
});

// ── gate://config ─────────────────────────────────────────────────────────────

describe("registerConfigResource", () => {
  it("lists gate://config as a resource", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "res-cfg-empty-"));
    const { client, close } = await connectWithResources((s) => registerConfigResource(s, cwd));
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("gate://config");
    await close();
  });

  it("returns valid JSON for an empty config", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "res-cfg-"));
    const { client, close } = await connectWithResources((s) => registerConfigResource(s, cwd));
    const result = await client.readResource({ uri: "gate://config" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe("application/json");
    const text = (result.contents[0] as { text: string }).text;
    expect(() => JSON.parse(text)).not.toThrow();
    await close();
  });

  it("exposes safe config fields and redacts unsafe ones", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "res-cfg-safe-"));
    // Write a project config with safe + unsafe fields
    const gwDir = join(cwd, ".gatewright");
    mkdirSync(gwDir, { recursive: true });
    writeFileSync(
      join(gwDir, "config.json"),
      JSON.stringify({
        defaultEngine: "claude-code",
        verbosity: "medium",
        jev: { enabled: true, model: "sonnet", endpoint: "https://private.api/v1" },
      }),
    );
    const { client, close } = await connectWithResources((s) => registerConfigResource(s, cwd));
    const result = await client.readResource({ uri: "gate://config" });
    const cfg = JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
    expect(cfg["defaultEngine"]).toBe("claude-code");
    expect(cfg["verbosity"]).toBe("medium");
    const jev = cfg["jev"] as Record<string, unknown>;
    expect(jev["enabled"]).toBe(true);
    expect(jev["model"]).toBe("sonnet");
    // endpoint is not in ALLOWED_KEYS → redacted
    expect(jev["endpoint"]).toBe("[REDACTED]");
    await close();
  });

  it("does not leak secret-looking values", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "res-cfg-secret-"));
    const gwDir = join(cwd, ".gatewright");
    mkdirSync(gwDir, { recursive: true });
    writeFileSync(
      join(gwDir, "config.json"),
      JSON.stringify({ defaultEngine: "sk-shouldnotleak", verbosity: "medium" }),
    );
    const { client, close } = await connectWithResources((s) => registerConfigResource(s, cwd));
    const result = await client.readResource({ uri: "gate://config" });
    const cfg = JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
    expect(cfg["defaultEngine"]).toBe("[REDACTED]");
    await close();
  });
});
