import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMcpServer } from "./server.js";

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

async function connect(cwd?: string) {
  const server = createMcpServer(undefined, undefined, cwd ?? mkdtempSync(join(tmpdir(), "srv-test-")));
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return { server, client, close: async () => { await client.close(); await server.close(); } };
}

const parse = (res: ToolResult) => JSON.parse(res.content[0]!.text);

describe("MCP server — tools (backcompat)", () => {
  it("exposes all four gate tools unchanged", async () => {
    const { client, close } = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("list_gates");
    expect(tools).toContain("check_gate");
    expect(tools).toContain("configure_jev");
    expect(tools).toContain("get_jev_config");
    await close();
  });

  it("list_gates returns the four default gates", async () => {
    const { client, close } = await connect();
    const res = (await client.callTool({ name: "list_gates", arguments: {} })) as ToolResult;
    const names = parse(res).map((g: { name: string }) => g.name);
    expect(names).toEqual(["secret-guard", "verify-on-edit", "error-classifier", "proportion-gate"]);
    await close();
  });

  it("check_gate runs a gate and returns its decision", async () => {
    const { client, close } = await connect();
    const res = (await client.callTool({
      name: "check_gate",
      arguments: { name: "secret-guard", context: { event: "pre-read", cwd: "/x", toolInput: { file_path: "/p/.env" } } },
    })) as ToolResult;
    expect(parse(res).kind).toBe("deny");
    await close();
  });

  it("check_gate reports an unknown gate as an error", async () => {
    const { client, close } = await connect();
    const res = (await client.callTool({
      name: "check_gate",
      arguments: { name: "nope", context: { event: "stop", cwd: "/x" } },
    })) as ToolResult;
    expect(res.isError).toBe(true);
    await close();
  });
});

describe("MCP server — prompts (R1)", () => {
  it("exposes at least one gate.* prompt from the bundled skills", async () => {
    const { client, close } = await connect();
    const { prompts } = await client.listPrompts();
    const gatePrompts = prompts.filter((p) => p.name.startsWith("gate."));
    expect(gatePrompts.length).toBeGreaterThan(0);
    await close();
  });

  it("getPrompt returns a user message with the skill body", async () => {
    const { client, close } = await connect();
    const { prompts } = await client.listPrompts();
    const first = prompts.find((p) => p.name.startsWith("gate."))!;
    const result = await client.getPrompt({ name: first.name });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe("user");
    expect((result.messages[0]!.content as { type: string; text: string }).type).toBe("text");
    await close();
  });
});

describe("MCP server — resources (R1)", () => {
  it("exposes gate://usage and gate://config resources", async () => {
    const { client, close } = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("gate://usage");
    expect(uris).toContain("gate://config");
    await close();
  });

  it("gate://usage returns valid JSON", async () => {
    const { client, close } = await connect();
    const result = await client.readResource({ uri: "gate://usage" });
    const snap = JSON.parse((result.contents[0] as { text: string }).text) as Record<string, unknown>;
    expect(snap).toHaveProperty("totalTokensIn");
    await close();
  });

  it("gate://config returns valid JSON", async () => {
    const { client, close } = await connect();
    const result = await client.readResource({ uri: "gate://config" });
    expect(() => JSON.parse((result.contents[0] as { text: string }).text)).not.toThrow();
    await close();
  });
});
