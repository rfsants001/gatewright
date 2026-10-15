import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";

type ToolResult = { content: Array<{ text: string }>; isError?: boolean };

async function connect() {
  const server = createMcpServer();
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return { server, client, close: async () => { await client.close(); await server.close(); } };
}

const parse = (res: ToolResult) => JSON.parse(res.content[0]!.text);

describe("MCP server", () => {
  it("exposes the gate tools", async () => {
    const { client, close } = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("list_gates");
    expect(tools).toContain("check_gate");
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
