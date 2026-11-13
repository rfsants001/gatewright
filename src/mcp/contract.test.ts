// Contract tests — verify that the SDK channels each return the exact shape the
// MCP spec requires. Guards against silent breakage when the SDK is updated.
//
// Channels covered:
//   tools     → { content: [{ type: "text", text: string }] }
//   prompts   → { messages: [{ role: "user", content: { type: "text", text: string } }] }
//   resources → { contents: [{ uri: string, mimeType: string, text: string }] }

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { SkillCatalog } from "../core/skills/catalog.js";
import { registerSkillPrompts } from "./prompts.js";
import { registerUsageResource, registerConfigResource } from "./resources.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeTmpCwd(): string {
  return mkdtempSync(join(tmpdir(), "contract-test-"));
}

function makeSkillCatalog(name: string, description: string, body: string): SkillCatalog {
  const root = mkdtempSync(join(tmpdir(), "contract-skills-"));
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "triggers: []", "skill-kind: general", "---", "", body].join(
      "\n",
    ),
  );
  return new SkillCatalog(root);
}

async function connectContract(setup: (server: McpServer) => void) {
  const server = new McpServer({ name: "contract-test", version: "0" });
  setup(server);
  const client = new Client({ name: "contract-client", version: "0" });
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

// ── Tools contract ────────────────────────────────────────────────────────────

describe("Contract: tools channel", () => {
  it("listTools returns an array of tools with name and description", async () => {
    const { client, close } = await connectContract((s) => {
      s.registerTool("my-tool", { description: "a test tool", inputSchema: {} }, () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));
    });
    const { tools } = await client.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools[0]).toMatchObject({ name: "my-tool", description: "a test tool" });
    await close();
  });

  it("callTool returns { content: [{ type: 'text', text: string }] }", async () => {
    const { client, close } = await connectContract((s) => {
      s.registerTool("echo", { description: "echo", inputSchema: { msg: z.string() } }, ({ msg }) => ({
        content: [{ type: "text" as const, text: msg }],
      }));
    });
    const result = await client.callTool({ name: "echo", arguments: { msg: "hello" } }) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("hello");
    await close();
  });
});

// ── Prompts contract ──────────────────────────────────────────────────────────

describe("Contract: prompts channel", () => {
  it("listPrompts returns prompts with name and description", async () => {
    const catalog = makeSkillCatalog("test-skill", "A test skill", "Do the test.");
    const { client, close } = await connectContract((s) => registerSkillPrompts(s, catalog));
    const { prompts } = await client.listPrompts();
    expect(Array.isArray(prompts)).toBe(true);
    const p = prompts.find((x) => x.name === "gate.test-skill");
    expect(p).toBeDefined();
    expect(p!.description).toBe("A test skill");
    await close();
  });

  it("getPrompt returns { messages: [{ role: 'user', content: { type: 'text', text } }] }", async () => {
    const catalog = makeSkillCatalog("contract-skill", "Contract skill", "Contract body text.");
    const { client, close } = await connectContract((s) => registerSkillPrompts(s, catalog));
    const result = await client.getPrompt({ name: "gate.contract-skill" });

    // Top-level shape
    expect(result).toHaveProperty("messages");
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages).toHaveLength(1);

    // Message shape
    const msg = result.messages[0]!;
    expect(msg.role).toBe("user");
    expect(msg.content).toMatchObject({ type: "text", text: "Contract body text." });

    await close();
  });

  it("getPrompt with no arguments succeeds (zero-arg prompt)", async () => {
    const catalog = makeSkillCatalog("no-arg-skill", "No args", "Body.");
    const { client, close } = await connectContract((s) => registerSkillPrompts(s, catalog));
    // Must NOT throw when called without arguments property
    await expect(client.getPrompt({ name: "gate.no-arg-skill" })).resolves.toBeDefined();
    await close();
  });
});

// ── Resources contract ────────────────────────────────────────────────────────

describe("Contract: resources channel", () => {
  it("listResources returns resources with uri and mimeType", async () => {
    const cwd = makeTmpCwd();
    const { client, close } = await connectContract((s) => {
      registerUsageResource(s, cwd);
      registerConfigResource(s, cwd);
    });
    const { resources } = await client.listResources();
    expect(Array.isArray(resources)).toBe(true);
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("gate://usage");
    expect(uris).toContain("gate://config");
    await close();
  });

  it("readResource gate://usage returns { contents: [{ uri, mimeType, text }] }", async () => {
    const cwd = makeTmpCwd();
    const { client, close } = await connectContract((s) => registerUsageResource(s, cwd));
    const result = await client.readResource({ uri: "gate://usage" });

    // Top-level shape
    expect(result).toHaveProperty("contents");
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents).toHaveLength(1);

    // Content item shape
    const item = result.contents[0]!;
    expect(item.uri).toBe("gate://usage");
    expect(item.mimeType).toBe("application/json");
    expect(typeof (item as { text: string }).text).toBe("string");

    // Must be valid JSON
    expect(() => JSON.parse((item as { text: string }).text)).not.toThrow();

    await close();
  });

  it("readResource gate://config returns { contents: [{ uri, mimeType, text }] }", async () => {
    const cwd = makeTmpCwd();
    const { client, close } = await connectContract((s) => registerConfigResource(s, cwd));
    const result = await client.readResource({ uri: "gate://config" });

    expect(result.contents).toHaveLength(1);
    const item = result.contents[0]!;
    expect(item.uri).toBe("gate://config");
    expect(item.mimeType).toBe("application/json");
    expect(() => JSON.parse((item as { text: string }).text)).not.toThrow();

    await close();
  });

  it("resources payloads do NOT share the tools { content } shape", async () => {
    const cwd = makeTmpCwd();
    const { client, close } = await connectContract((s) => registerUsageResource(s, cwd));
    const result = await client.readResource({ uri: "gate://usage" });
    // Must have 'contents' (plural), not 'content'
    expect(result).toHaveProperty("contents");
    expect(result).not.toHaveProperty("content");
    await close();
  });
});

// ── SDK version pin ───────────────────────────────────────────────────────────

describe("Contract: SDK version pin", () => {
  it("@modelcontextprotocol/sdk is pinned to exact version 1.32.1", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.32.1");
    expect(lock.packages[""].dependencies["@modelcontextprotocol/sdk"]).toBe("1.32.1");
    expect(lock.packages["node_modules/@modelcontextprotocol/sdk"].version).toBe("1.32.1");
  });
});
