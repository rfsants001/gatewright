// E2E: swap Jev for an external advisor via AI-driven config (R2-007).
//
// Canonical flow (no hardcoded adapter):
//   set_module_enabled jev=false
//   → integrate_tool propose (stub complete returns advisor Change)
//   → integrate_tool confirm
//   → resolveAdvisor returns ExternalAdvisor backed by fake HTTP server
//   → set_module_enabled ext=false → resolveAdvisor returns null (reversible)
//   → journal records PROPOSAL_CONFIRMED + PROPOSAL_APPLIED (auditable)

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer as httpCreateServer, type Server as HttpServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMcpServer } from "./server.js";
import { resolveAdvisor } from "../core/jev/advisor.js";
import { ExternalAdvisor } from "../core/jev/advisor.js";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import type { CompleteFn } from "../core/integrations/configure.js";
import type { Provider } from "../app/providers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };
const parse = (res: ToolResult) => JSON.parse(res.content[0]!.text) as Record<string, unknown>;

/** Start a minimal fake advisor HTTP server and return its URL + server handle. */
function startFakeAdvisorServer(): Promise<{ url: string; server: HttpServer; requests: unknown[] }> {
  const requests: unknown[] = [];
  return new Promise((resolve) => {
    const server = httpCreateServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        try { requests.push(JSON.parse(body)); } catch { requests.push(body); }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ verdict: "discard", confidence: 0.9, rationale: "external says no" }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${addr.port}`, server, requests });
    });
  });
}

/** Write a provider into the project config so providers(cwd) returns it. */
function seedProvider(cwd: string, provider: Provider): void {
  const store = new ConfigStore(new FileArtifactStore());
  const existing = store.read("project", cwd).providers ?? [];
  store.write("project", { providers: [...existing, provider] }, cwd);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let cwd: string;
let fakeServer: HttpServer;
let fakeUrl: string;
let fakeRequests: unknown[];
let client: Client;
let closeMcp: () => Promise<void>;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "advisor-swap-e2e-"));
  mkdirSync(join(cwd, ".gatewright"), { recursive: true });

  const fake = await startFakeAdvisorServer();
  fakeServer = fake.server;
  fakeUrl = fake.url;
  fakeRequests = fake.requests;

  // Seed a provider so providers(cwd) returns it.
  seedProvider(cwd, { id: "stub", endpoint: `${fakeUrl}/v1`, model: "stub-model" });

  // Stub complete returns a valid advisor Change JSON that includes the endpoint.
  const stubComplete: CompleteFn = async (_provider, _prompt, _signal, _sys) => ({
    text: JSON.stringify({ kind: "advisor", name: "ext", endpoint: fakeUrl, model: "m" }),
  });

  const server = createMcpServer(undefined, undefined, cwd, stubComplete);
  client = new Client({ name: "advisor-swap-e2e", version: "0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  closeMcp = async () => { await client.close(); await server.close(); };
});

afterEach(async () => {
  await closeMcp();
  await new Promise<void>((r) => fakeServer.close(() => r()));
  rmSync(cwd, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("R2-007 — swap Jev for external advisor via MCP tools", () => {
  it("full propose → confirm → resolve → reverse flow", async () => {
    // 1. Disable jev.
    const disableJev = (await client.callTool({
      name: "set_module_enabled",
      arguments: { id: "jev", enabled: false },
    })) as ToolResult;
    expect(disableJev.isError).toBeFalsy();
    const jevState = parse(disableJev);
    expect(jevState["id"]).toBe("jev");
    expect(jevState["enabled"]).toBe(false);

    // 2. Propose integration (phase 1). Nothing applied yet.
    const proposeRes = (await client.callTool({
      name: "integrate_tool",
      arguments: {
        providerId: "stub",
        spec: { kind: "advisor", endpoint: fakeUrl, intent: "use external judgment" },
      },
    })) as ToolResult;
    expect(proposeRes.isError).toBeFalsy();
    const proposal = parse(proposeRes);
    expect(typeof proposal["revision"]).toBe("string");
    expect((proposal["change"] as Record<string, unknown>)["kind"]).toBe("advisor");
    expect(proposal).toHaveProperty("plan");

    // Nothing applied yet: jev is disabled, no external advisor module in project config.
    const advisorBeforeApply = resolveAdvisor(cwd);
    expect(advisorBeforeApply).toBeNull();

    // 3. Confirm (phase 2).
    const revision = proposal["revision"] as string;
    const confirmRes = (await client.callTool({
      name: "integrate_tool",
      arguments: { confirm: revision },
    })) as ToolResult;
    expect(confirmRes.isError).toBeFalsy();
    const confirmed = parse(confirmRes);
    expect(confirmed["applied"]).toBe(true);
    expect(confirmed["revision"]).toBe(revision);

    // 4. resolveAdvisor now returns ExternalAdvisor.
    const advisor = resolveAdvisor(cwd);
    expect(advisor).not.toBeNull();
    expect(advisor).toBeInstanceOf(ExternalAdvisor);

    // 5. advise() calls the fake server.
    const verdict = await advisor!.advise("some-gate", "summary");
    expect(verdict).not.toBeNull();
    expect(verdict!.verdict).toBe("discard");
    expect(verdict!.rationale).toBe("external says no");
    expect(fakeRequests.length).toBeGreaterThan(0);

    // 6. Reversibility: disable the external advisor module.
    const disableExt = (await client.callTool({
      name: "set_module_enabled",
      arguments: { id: "ext", enabled: false },
    })) as ToolResult;
    expect(disableExt.isError).toBeFalsy();
    expect(parse(disableExt)["enabled"]).toBe(false);

    // resolveAdvisor now returns null (jev disabled + no enabled external advisor).
    const advisorAfterReverse = resolveAdvisor(cwd);
    expect(advisorAfterReverse).toBeNull();

    // 7. Audit trail: journal must contain PROPOSAL_CONFIRMED and PROPOSAL_APPLIED.
    const journalPath = join(cwd, ".gatewright", "integrations.json");
    const events = JSON.parse(readFileSync(journalPath, "utf8")) as Array<{ type: string }>;
    const types = events.map((e) => e.type);
    expect(types).toContain("PROPOSAL_CONFIRMED");
    expect(types).toContain("PROPOSAL_APPLIED");
  });

  it("integrate_tool returns error for unknown provider", async () => {
    const res = (await client.callTool({
      name: "integrate_tool",
      arguments: { providerId: "ghost", spec: { kind: "advisor", endpoint: fakeUrl, intent: "test" } },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(parse(res)["error"]).toMatch(/unknown provider/);
  });

  it("integrate_tool confirm with expired revision returns error", async () => {
    const res = (await client.callTool({
      name: "integrate_tool",
      arguments: { confirm: "deadbeef00000000000000000000000000000000000000000000000000000000" },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(parse(res)["error"]).toMatch(/expired/);
  });

  it("set_module_enabled returns error for unknown non-jev module", async () => {
    const res = (await client.callTool({
      name: "set_module_enabled",
      arguments: { id: "ghost-module", enabled: true },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    expect(parse(res)["error"]).toMatch(/unknown module/);
  });
});
