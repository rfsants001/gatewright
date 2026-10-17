// The gate's OWN skills — a curated, tool-agnostic catalog that ships with Gatewright
// (clean-room; concepts mirrored, content ours). Because the gate is the orchestrator,
// these are the skills we list and the ones we hand to the engine it drives — not the
// host AI's skills.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SkillCatalog } from "./catalog.js";
import type { Skill } from "./types.js";

/** Root of the bundled skills. Overridable via GATEWRIGHT_SKILLS_DIR. */
export function gateSkillsRoot(): string {
  if (process.env.GATEWRIGHT_SKILLS_DIR) return process.env.GATEWRIGHT_SKILLS_DIR;
  // <root>/dist/core/skills/gate-catalog.js (or src/… under vitest) → <root>/skills
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "skills");
}

export function loadGateSkills(root: string = gateSkillsRoot()): SkillCatalog {
  return new SkillCatalog(root);
}

/**
 * Condense the gate's skills into a system-prompt fragment the driven engine receives
 * (via --append-system-prompt), so a run uses the GATE's skills, not the host AI's.
 */
export function buildSkillsSystemPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const lines = skills
    .slice()
    .sort((a, b) => a.frontmatter.skillKind.localeCompare(b.frontmatter.skillKind) || a.frontmatter.name.localeCompare(b.frontmatter.name))
    .map((s) => `- ${s.frontmatter.name} [${s.frontmatter.skillKind}]: ${s.frontmatter.description}`);
  return [
    "This session runs under Gatewright. It curates the following skills — prefer them when a task matches, and follow their steps:",
    ...lines,
  ].join("\n");
}
