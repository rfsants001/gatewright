// MCP prompts — expose each public skill in the SkillCatalog as a zero-argument
// MCP prompt. Prompt name = `gate.<frontmatter.name>`. Skills under `_system/`
// directories are never exposed (reserved for future internal use).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SkillCatalog } from "../core/skills/catalog.js";
import type { Skill } from "../core/skills/types.js";

/** Returns true when a skill is a system-only skill (never expose publicly). */
function isSystemSkill(skill: Skill): boolean {
  return skill.frontmatter.name.startsWith("_system/");
}

/**
 * Register every public skill in `catalog` as a zero-argument MCP prompt on
 * `server`. Must be called before the server is connected to a transport.
 */
export function registerSkillPrompts(server: McpServer, catalog: SkillCatalog): void {
  for (const skill of catalog.list()) {
    if (isSystemSkill(skill)) continue;

    const promptName = `gate.${skill.frontmatter.name}`;
    const description = skill.frontmatter.description;
    const body = skill.body;

    server.registerPrompt(
      promptName,
      { description },
      () => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: body },
          },
        ],
      }),
    );
  }
}
