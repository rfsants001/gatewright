// E2E (in-process): a MCP Client wired to the full createMcpServer via an
// InMemoryTransport inherits a skill as a prompt and reads gate://usage.
// This test proves the MCP-provider mechanics — the same plumbing that a real
// Claude Code would use when pointed at `gate serve`.
//
// NOTE (NF-004): in-process transport proves the mechanism but does NOT substitute
// for the manual validation checklist in the README (pointing a real Claude Code
// at `gate serve` and invoking a skill). See the README for that checklist.

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMcpServer } from "./server.js";

async function connectFull(cwd: string) {
  const server = createMcpServer(undefined, undefined, cwd);
  const client = new Client({ name: "e2e-test-client", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP provider — in-process e2e", () => {
  it("client lists at least one gate.* prompt (skill inherited from catalog)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "e2e-test-"));
    const { client, close } = await connectFull(cwd);

    const { prompts } = await client.listPrompts();
    const gatePrompts = prompts.filter((p) => p.name.startsWith("gate."));

    // The bundled skills directory must contain at least one public skill.
    expect(gatePrompts.length).toBeGreaterThan(0);

    await close();
  });

  it("client can get a skill body via getPrompt (zero-arg, user role, text content)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "e2e-test-"));
    const { client, close } = await connectFull(cwd);

    const { prompts } = await client.listPrompts();
    const skill = prompts.find((p) => p.name.startsWith("gate."))!;
    expect(skill).toBeDefined();

    const result = await client.getPrompt({ name: skill.name });

    // Shape: { messages: [{ role: "user", content: { type: "text", text: <body> } }] }
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0]!;
    expect(msg.role).toBe("user");
    expect(msg.content.type).toBe("text");
    const text = (msg.content as { type: "text"; text: string }).text;
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);

    await close();
  });

  it("client can read gate://usage resource (snapshot, application/json)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "e2e-test-"));
    const { client, close } = await connectFull(cwd);

    const result = await client.readResource({ uri: "gate://usage" });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]!.mimeType).toBe("application/json");

    const text = (result.contents[0] as { text: string }).text;
    const snap = JSON.parse(text) as Record<string, unknown>;

    // Shape from UsageSnapshot (redacted — cwd will be "[REDACTED]" since not in allow-list)
    expect(snap).toHaveProperty("totalTokensIn");
    expect(snap).toHaveProperty("totalTokensOut");
    expect(snap).toHaveProperty("totalCacheRead");
    expect(snap).toHaveProperty("byModel");
    expect(snap).toHaveProperty("byRun");
    // Empty cwd has no runs → zeros
    expect(snap["totalTokensIn"]).toBe(0);
    expect(Array.isArray(snap["byModel"])).toBe(true);
    expect(Array.isArray(snap["byRun"])).toBe(true);

    await close();
  });

  it("the four original tools are still present (backcompat)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "e2e-test-"));
    const { client, close } = await connectFull(cwd);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_gates");
    expect(names).toContain("check_gate");
    expect(names).toContain("configure_jev");
    expect(names).toContain("get_jev_config");

    await close();
  });
});
