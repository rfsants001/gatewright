import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadGateSkills, gateSkillsRoot, buildSkillsSystemPrompt } from "./gate-catalog.js";

const root = join(process.cwd(), "skills");

describe("gate skill catalog (bundled)", () => {
  it("resolves a path ending in /skills", () => {
    expect(gateSkillsRoot().replace(/\\/g, "/")).toMatch(/\/skills$/);
  });

  it("parses all bundled skills with no problems", () => {
    const cat = loadGateSkills(root);
    expect(cat.problems()).toEqual([]);
    expect(cat.list().length).toBeGreaterThanOrEqual(29);
  });

  it("every bundled skill is gate-prefixed and tool-agnostic (no enterprise connectors)", () => {
    const names = loadGateSkills(root).list().map((s) => s.frontmatter.name);
    expect(names.every((n) => n.startsWith("gate-"))).toBe(true);
    const banned = /jira|octane|bitbucket|github|confluence|bamboo|sonar|figma|firebase|google|dynatrace|nexus/i;
    expect(names.filter((n) => banned.test(n))).toEqual([]);
  });

  it("groups into architecture/development/quality/workflows", () => {
    const kinds = new Set(Object.keys(loadGateSkills(root).byCategory()));
    for (const k of ["architecture", "development", "quality", "workflows", "sdd"]) expect(kinds.has(k)).toBe(true);
  });

  it("builds a system-prompt fragment listing the skills", () => {
    const prompt = buildSkillsSystemPrompt(loadGateSkills(root).list());
    expect(prompt).toContain("runs under Gatewright");
    expect(prompt).toContain("gate-code-review");
  });

  it("returns empty prompt for no skills", () => {
    expect(buildSkillsSystemPrompt([])).toBe("");
  });
});
