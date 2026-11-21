// skills-query.ts — pure query layer over the skill catalogs and agent profiles.
// Merges bundled + project skills, resolves origin, computes dependents, and
// surfaces catalog problems — without touching agents.ts, catalog.ts, or bridge.

import { join } from "node:path";
import { loadGateSkills } from "./gate-catalog.js";
import { projectAgents } from "./agents.js";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export type SkillOrigin = "bundled" | "project";

export interface SkillSummary {
  name: string;
  description: string;
  category: string;
  origin: SkillOrigin;
  /** ids of projectAgents(cwd) whose .skills[] includes this skill name */
  dependents: string[];
  /** true when the skill dir failed to parse (best-effort name = dir name) */
  invalid?: boolean;
}

export interface SkillDetail extends SkillSummary {
  body: string;
  // Mapped from frontmatter.metadata fields (same keys used by composeAgent):
  //   metadata.responsibilities → responsibilities
  //   metadata.expectedInput    → expectedInput
  //   metadata.expectedOutput   → expectedOutput
  //   metadata.boundaries       → boundaries
  responsibilities?: string;
  expectedInput?: string;
  expectedOutput?: string;
  boundaries?: string;
}

export interface SkillsListResult {
  skills: SkillSummary[];
  categories: string[];
  origins: SkillOrigin[];
  problems: { dir: string; message: string }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function projectSkillsDir(cwd: string): string {
  return join(cwd, ".gatewright", "skills");
}

/** `metadata.category` if non-empty, else `skillKind` (defaults to "general"). */
function resolveCategory(skillKind: string, metadata: Record<string, string>): string {
  const c = metadata["category"];
  return c && c.trim().length > 0 ? c.trim() : skillKind;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function listSkills(
  cwd: string,
  filter?: { query?: string; category?: string; origin?: SkillOrigin },
): SkillsListResult {
  const bundledCat = loadGateSkills();
  const projectCat = loadGateSkills(projectSkillsDir(cwd));

  // Build a name→origin map (project wins)
  const projectNames = new Set(projectCat.list().map((s) => s.frontmatter.name));

  // Collect agents once for dependent resolution
  const agents = projectAgents(cwd);

  // Build the merged skill summaries
  const summaries: SkillSummary[] = [];

  // Bundled skills that are NOT shadowed by a project skill
  for (const skill of bundledCat.list()) {
    if (projectNames.has(skill.frontmatter.name)) continue; // shadowed
    const name = skill.frontmatter.name;
    summaries.push({
      name,
      description: skill.frontmatter.description,
      category: resolveCategory(skill.frontmatter.skillKind, skill.frontmatter.metadata),
      origin: "bundled",
      dependents: agents.filter((a) => a.skills.includes(name)).map((a) => a.id),
    });
  }

  // Project skills (always included; they shadow bundled of same name)
  for (const skill of projectCat.list()) {
    const name = skill.frontmatter.name;
    summaries.push({
      name,
      description: skill.frontmatter.description,
      category: resolveCategory(skill.frontmatter.skillKind, skill.frontmatter.metadata),
      origin: "project",
      dependents: agents.filter((a) => a.skills.includes(name)).map((a) => a.id),
    });
  }

  // Problems: bundled problems get origin "bundled", project problems get "project"
  const allProblems: { dir: string; message: string }[] = [
    ...bundledCat.problems(),
    ...projectCat.problems(),
  ];

  // Invalid entries from problems — best-effort name = dir name
  for (const p of bundledCat.problems()) {
    summaries.push({ name: p.dir, description: "", category: "general", origin: "bundled", dependents: [], invalid: true });
  }
  for (const p of projectCat.problems()) {
    summaries.push({ name: p.dir, description: "", category: "general", origin: "project", dependents: [], invalid: true });
  }

  // Apply filters
  const q = filter?.query?.toLowerCase();
  const filtered = summaries.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
    if (filter?.category && s.category !== filter.category) return false;
    if (filter?.origin && s.origin !== filter.origin) return false;
    return true;
  });

  // Distinct categories and origins present in the FILTERED result
  const categories = [...new Set(filtered.map((s) => s.category))].sort();
  const originsSet = new Set<SkillOrigin>(filtered.map((s) => s.origin));
  const origins: SkillOrigin[] = (["bundled", "project"] as SkillOrigin[]).filter((o) => originsSet.has(o));

  return { skills: filtered, categories, origins, problems: allProblems };
}

export function skillDetail(cwd: string, name: string): SkillDetail | null {
  const bundledCat = loadGateSkills();
  const projectCat = loadGateSkills(projectSkillsDir(cwd));

  // Project wins
  const projectSkill = projectCat.resolve(name);
  const skill = projectSkill ?? bundledCat.resolve(name);
  if (!skill) return null;

  const origin: SkillOrigin = projectSkill ? "project" : "bundled";
  const agents = projectAgents(cwd);
  const { metadata } = skill.frontmatter;

  const summary: SkillSummary = {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    category: resolveCategory(skill.frontmatter.skillKind, metadata),
    origin,
    dependents: agents.filter((a) => a.skills.includes(name)).map((a) => a.id),
  };

  const detail: SkillDetail = { ...summary, body: skill.body };

  // Map metadata fields to optional detail fields — only set when non-empty
  const responsibilities = metadata["responsibilities"];
  if (responsibilities && responsibilities.trim().length > 0) detail.responsibilities = responsibilities.trim();

  const expectedInput = metadata["expectedInput"];
  if (expectedInput && expectedInput.trim().length > 0) detail.expectedInput = expectedInput.trim();

  const expectedOutput = metadata["expectedOutput"];
  if (expectedOutput && expectedOutput.trim().length > 0) detail.expectedOutput = expectedOutput.trim();

  const boundaries = metadata["boundaries"];
  if (boundaries && boundaries.trim().length > 0) detail.boundaries = boundaries.trim();

  return detail;
}
