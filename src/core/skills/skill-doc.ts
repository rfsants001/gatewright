// SKILL.md parse/serialize — a minimal, dependency-free frontmatter reader.
// Supports `key: value` scalars; `triggers` and `metadata.*` keys get list/map
// treatment. Tolerant: a malformed doc raises a typed SkillError, never crashes.

import { SkillError, type Skill, type SkillFrontmatter } from "./types.js";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseList(value: string): string[] {
  const inner = value.trim().replace(/^\[|\]$/g, "");
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => s.length > 0);
}

export function parseSkill(md: string): Skill {
  const m = md.match(FRONTMATTER);
  if (!m) throw new SkillError("NO_FRONTMATTER", "SKILL.md has no '---' frontmatter block");

  const fields: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key.startsWith("metadata.")) metadata[key.slice("metadata.".length)] = value;
    else fields[key] = value;
  }

  const name = fields["name"];
  const description = fields["description"];
  if (!name || !description) throw new SkillError("MISSING_FIELD", "SKILL.md requires 'name' and 'description'");

  const frontmatter: SkillFrontmatter = {
    name,
    description,
    triggers: fields["triggers"] ? parseList(fields["triggers"]) : [],
    skillKind: fields["skill-kind"] ?? "general",
    metadata,
  };
  return { frontmatter, body: (m[2] ?? "").trim() };
}

export function serializeSkill(skill: Skill): string {
  const f = skill.frontmatter;
  const lines = [
    "---",
    `name: ${f.name}`,
    `description: ${f.description}`,
    `triggers: [${f.triggers.join(", ")}]`,
    `skill-kind: ${f.skillKind}`,
    ...Object.entries(f.metadata).map(([k, v]) => `metadata.${k}: ${v}`),
    "---",
    "",
    skill.body,
    "",
  ];
  return lines.join("\n");
}
