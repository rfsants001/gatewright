import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SkillCatalog } from "../core/skills/catalog.js";
import { registerSkillPrompts } from "./prompts.js";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

/** Build a minimal skill catalog in a temp directory. */
function makeCatalog(skills: Array<{ name: string; description: string; body: string }>): SkillCatalog {
  const root = mkdtempSync(join(tmpdir(), "prompts-test-"));
  for (const s of skills) {
    const dir = join(root, s.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      [
        "---",
        `name: ${s.name}`,
        `description: ${s.description}`,
        "triggers: []",
        "skill-kind: general",
        "---",
        "",
        s.body,
      ].join("\n"),
    );
  }
  return new SkillCatalog(root);
}

async function connect(catalog: SkillCatalog) {
  const server = new McpServer({ name: "test-prompts", version: "0" });
  registerSkillPrompts(server, catalog);
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

describe("registerSkillPrompts", () => {
  it("lists prompts with the gate. prefix", async () => {
    const catalog = makeCatalog([
      { name: "my-skill", description: "does something", body: "Do the thing." },
    ]);
    const { client, close } = await connect(catalog);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("gate.my-skill");
    await close();
  });

  it("returns the correct description", async () => {
    const catalog = makeCatalog([
      { name: "my-skill", description: "does something cool", body: "Body text." },
    ]);
    const { client, close } = await connect(catalog);
    const { prompts } = await client.listPrompts();
    const prompt = prompts.find((p) => p.name === "gate.my-skill");
    expect(prompt?.description).toBe("does something cool");
    await close();
  });

  it("getPrompt returns the skill body as a user message (no args)", async () => {
    const catalog = makeCatalog([
      { name: "code-review", description: "review code", body: "Review the diff carefully." },
    ]);
    const { client, close } = await connect(catalog);
    const result = await client.getPrompt({ name: "gate.code-review" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe("user");
    const content = result.messages[0]!.content;
    expect(content.type).toBe("text");
    expect((content as { type: "text"; text: string }).text).toBe("Review the diff carefully.");
    await close();
  });

  it("lists multiple skills as separate prompts", async () => {
    const catalog = makeCatalog([
      { name: "skill-a", description: "a", body: "A body" },
      { name: "skill-b", description: "b", body: "B body" },
      { name: "skill-c", description: "c", body: "C body" },
    ]);
    const { client, close } = await connect(catalog);
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain("gate.skill-a");
    expect(names).toContain("gate.skill-b");
    expect(names).toContain("gate.skill-c");
    await close();
  });

  it("filters out _system/ skills", async () => {
    const catalog = makeCatalog([
      { name: "_system/internal", description: "internal", body: "private" },
      { name: "public-skill", description: "public", body: "visible" },
    ]);
    const { client, close } = await connect(catalog);
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).not.toContain("gate._system/internal");
    expect(names).toContain("gate.public-skill");
    await close();
  });

  it("handles an empty catalog gracefully (no prompts registered → capability absent)", async () => {
    // When no prompts are registered, the SDK does not advertise the prompts
    // capability, so listPrompts throws McpError -32601 (Method not found).
    // This is the expected SDK behaviour for an empty catalog.
    const catalog = makeCatalog([]);
    const { client, close } = await connect(catalog);
    await expect(client.listPrompts()).rejects.toThrow();
    await close();
  });
});
