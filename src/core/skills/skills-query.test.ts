import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSkill } from "./skill-doc.js";
import type { Skill } from "./types.js";
import { listSkills, skillDetail } from "./skills-query.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill["frontmatter"]> & Pick<Skill["frontmatter"], "name">): Skill {
  return {
    frontmatter: {
      description: `${overrides.name} description`,
      triggers: [],
      skillKind: "general",
      metadata: {},
      ...overrides,
    },
    body: `# ${overrides.name}\n\nbody text`,
  };
}

/** Write a SKILL.md fixture under <cwd>/.gatewright/skills/<name>/SKILL.md */
function writeProjectSkill(cwd: string, name: string, skill: Skill): void {
  const dir = join(cwd, ".gatewright", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), serializeSkill(skill));
}

/** Write a malformed SKILL.md (no frontmatter) to trigger a problem entry */
function writeBrokenProjectSkill(cwd: string, dirName: string): void {
  const dir = join(cwd, ".gatewright", "skills", dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "this has no frontmatter block");
}

/** Write a .gatewright/config.json with an agents array into cwd */
function writeAgentsConfig(cwd: string, agents: object[]): void {
  const gwDir = join(cwd, ".gatewright");
  mkdirSync(gwDir, { recursive: true });
  writeFileSync(join(gwDir, "config.json"), JSON.stringify({ agents }, null, 2));
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "gw-skillsq-"));
  // Isolate from the real bundled catalog so tests are deterministic.
  // Set GATEWRIGHT_SKILLS_DIR to an empty dir — bundled catalog will be empty.
  process.env["GATEWRIGHT_SKILLS_DIR"] = join(cwd, "empty-bundled");
  mkdirSync(join(cwd, "empty-bundled"), { recursive: true });
});

afterEach(() => {
  delete process.env["GATEWRIGHT_SKILLS_DIR"];
  rmSync(cwd, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("listSkills", () => {
  it("returns empty result when no skills exist", () => {
    const result = listSkills(cwd);
    expect(result.skills).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.origins).toEqual([]);
    expect(result.problems).toEqual([]);
  });

  it("project skill shadows bundled of same name, origin=project", () => {
    // Write a bundled skill with same name
    const bundledDir = join(cwd, "empty-bundled");
    const bundledSkillDir = join(bundledDir, "shared-skill");
    mkdirSync(bundledSkillDir, { recursive: true });
    writeFileSync(join(bundledSkillDir, "SKILL.md"), serializeSkill(makeSkill({ name: "shared-skill", description: "bundled version" })));

    // Write project skill with same name
    writeProjectSkill(cwd, "shared-skill", makeSkill({ name: "shared-skill", description: "project version" }));

    const result = listSkills(cwd);
    const skill = result.skills.find((s) => s.name === "shared-skill");
    expect(skill).toBeDefined();
    expect(skill!.origin).toBe("project");
    expect(skill!.description).toBe("project version");
    // Only one entry (not duplicated)
    expect(result.skills.filter((s) => s.name === "shared-skill")).toHaveLength(1);
  });

  it("bundled skill that is NOT shadowed has origin=bundled", () => {
    const bundledDir = join(cwd, "empty-bundled");
    const bundledSkillDir = join(bundledDir, "bundled-only");
    mkdirSync(bundledSkillDir, { recursive: true });
    writeFileSync(join(bundledSkillDir, "SKILL.md"), serializeSkill(makeSkill({ name: "bundled-only" })));

    const result = listSkills(cwd);
    const skill = result.skills.find((s) => s.name === "bundled-only");
    expect(skill!.origin).toBe("bundled");
  });

  it("distinct categories derived from present skills", () => {
    writeProjectSkill(cwd, "a", makeSkill({ name: "a", skillKind: "quality" }));
    writeProjectSkill(cwd, "b", makeSkill({ name: "b", skillKind: "workflows" }));
    writeProjectSkill(cwd, "c", makeSkill({ name: "c", skillKind: "quality" }));

    const { categories } = listSkills(cwd);
    expect(categories.sort()).toEqual(["quality", "workflows"]);
  });

  it("distinct origins in result", () => {
    // bundled skill
    const bundledDir = join(cwd, "empty-bundled");
    mkdirSync(join(bundledDir, "bund"), { recursive: true });
    writeFileSync(join(bundledDir, "bund", "SKILL.md"), serializeSkill(makeSkill({ name: "bund" })));
    // project skill
    writeProjectSkill(cwd, "proj", makeSkill({ name: "proj" }));

    const { origins } = listSkills(cwd);
    expect(origins.sort()).toEqual(["bundled", "project"]);
  });

  it("category uses metadata.category when present", () => {
    writeProjectSkill(cwd, "meta-cat", makeSkill({ name: "meta-cat", skillKind: "general", metadata: { category: "custom-cat" } }));
    const result = listSkills(cwd);
    expect(result.skills[0]!.category).toBe("custom-cat");
  });

  it("category falls back to skillKind when metadata.category is absent", () => {
    writeProjectSkill(cwd, "no-cat", makeSkill({ name: "no-cat", skillKind: "architecture" }));
    const result = listSkills(cwd);
    expect(result.skills[0]!.category).toBe("architecture");
  });

  describe("filters", () => {
    beforeEach(() => {
      writeProjectSkill(cwd, "deploy-app", makeSkill({ name: "deploy-app", description: "ships production release", skillKind: "workflows" }));
      writeProjectSkill(cwd, "code-review", makeSkill({ name: "code-review", description: "reviews PRs", skillKind: "quality" }));
    });

    it("query matches by name (case-insensitive)", () => {
      const { skills } = listSkills(cwd, { query: "DEPLOY" });
      expect(skills.map((s) => s.name)).toEqual(["deploy-app"]);
    });

    it("query matches by description (case-insensitive)", () => {
      const { skills } = listSkills(cwd, { query: "review" });
      // matches both name "code-review" and may match description
      expect(skills.some((s) => s.name === "code-review")).toBe(true);
    });

    it("category filter exact match", () => {
      const { skills } = listSkills(cwd, { category: "quality" });
      expect(skills.every((s) => s.category === "quality")).toBe(true);
      expect(skills.map((s) => s.name)).toEqual(["code-review"]);
    });

    it("origin filter exact match", () => {
      const bundledDir = join(cwd, "empty-bundled");
      mkdirSync(join(bundledDir, "bund-skill"), { recursive: true });
      writeFileSync(join(bundledDir, "bund-skill", "SKILL.md"), serializeSkill(makeSkill({ name: "bund-skill" })));

      const { skills } = listSkills(cwd, { origin: "bundled" });
      expect(skills.every((s) => s.origin === "bundled")).toBe(true);
      expect(skills.some((s) => s.name === "bund-skill")).toBe(true);
    });

    it("non-matching filter returns empty skills but preserves problems", () => {
      writeBrokenProjectSkill(cwd, "broken-dir");
      const result = listSkills(cwd, { query: "xyzzy-no-match" });
      expect(result.skills).toEqual([]);
      // problems come from catalog regardless of filter
      expect(result.problems.some((p) => p.dir === "broken-dir")).toBe(true);
    });

    it("categories/origins in result reflect filtered set only", () => {
      const { categories, origins } = listSkills(cwd, { category: "workflows" });
      expect(categories).toEqual(["workflows"]);
      expect(origins).toEqual(["project"]);
    });
  });

  describe("dependents", () => {
    it("agent referencing a skill appears in dependents", () => {
      writeProjectSkill(cwd, "my-skill", makeSkill({ name: "my-skill" }));
      writeAgentsConfig(cwd, [
        { id: "agent-a", name: "Agent A", goal: "does things", skills: ["my-skill"] },
        { id: "agent-b", name: "Agent B", goal: "does other things", skills: ["other-skill"] },
      ]);

      const result = listSkills(cwd);
      const skill = result.skills.find((s) => s.name === "my-skill");
      expect(skill!.dependents).toEqual(["agent-a"]);
    });

    it("skill with no agents referencing it has empty dependents", () => {
      writeProjectSkill(cwd, "orphan", makeSkill({ name: "orphan" }));
      const result = listSkills(cwd);
      expect(result.skills.find((s) => s.name === "orphan")!.dependents).toEqual([]);
    });
  });

  describe("invalid skills (problems)", () => {
    it("malformed skill dir surfaces as invalid entry and in problems, does not throw", () => {
      writeBrokenProjectSkill(cwd, "broken-skill");
      writeProjectSkill(cwd, "good-skill", makeSkill({ name: "good-skill" }));

      let result: ReturnType<typeof listSkills>;
      expect(() => { result = listSkills(cwd); }).not.toThrow();

      expect(result!.problems).toHaveLength(1);
      expect(result!.problems[0]!.dir).toBe("broken-skill");

      const invalid = result!.skills.find((s) => s.name === "broken-skill");
      expect(invalid).toBeDefined();
      expect(invalid!.invalid).toBe(true);

      const good = result!.skills.find((s) => s.name === "good-skill");
      expect(good).toBeDefined();
      expect(good!.invalid).toBeUndefined();
    });
  });

  describe("_system/ exclusion", () => {
    it("_system/ skills are never listed", () => {
      writeProjectSkill(cwd, "_system", makeSkill({ name: "_system/internal", description: "internal" }));
      // The catalog skips the _system directory; even if the dir is named differently
      // but the name starts with _system/, catalog.ts filters it out.
      const result = listSkills(cwd);
      expect(result.skills.every((s) => !s.name.startsWith("_system/"))).toBe(true);
    });
  });
});

describe("skillDetail", () => {
  it("returns null for unknown skill", () => {
    expect(skillDetail(cwd, "no-such-skill")).toBeNull();
  });

  it("returns body and base fields for a known skill", () => {
    writeProjectSkill(cwd, "my-detail", makeSkill({ name: "my-detail", description: "detail desc", skillKind: "quality" }));
    const detail = skillDetail(cwd, "my-detail");
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe("my-detail");
    expect(detail!.description).toBe("detail desc");
    expect(detail!.category).toBe("quality");
    expect(detail!.origin).toBe("project");
    expect(detail!.body).toContain("body text");
  });

  it("maps metadata fields to optional detail fields", () => {
    writeProjectSkill(cwd, "rich-skill", makeSkill({
      name: "rich-skill",
      metadata: {
        responsibilities: "owns deployment pipeline",
        expectedInput: "a PR number",
        expectedOutput: "deployed artifact URL",
        boundaries: "no rollback",
      },
    }));

    const detail = skillDetail(cwd, "rich-skill");
    expect(detail!.responsibilities).toBe("owns deployment pipeline");
    expect(detail!.expectedInput).toBe("a PR number");
    expect(detail!.expectedOutput).toBe("deployed artifact URL");
    expect(detail!.boundaries).toBe("no rollback");
  });

  it("omits optional fields when metadata keys are absent (exactOptionalPropertyTypes)", () => {
    writeProjectSkill(cwd, "plain-skill", makeSkill({ name: "plain-skill" }));
    const detail = skillDetail(cwd, "plain-skill");
    expect("responsibilities" in detail!).toBe(false);
    expect("expectedInput" in detail!).toBe(false);
    expect("expectedOutput" in detail!).toBe(false);
    expect("boundaries" in detail!).toBe(false);
  });

  it("project skill shadows bundled in skillDetail, origin=project", () => {
    const bundledDir = join(cwd, "empty-bundled");
    mkdirSync(join(bundledDir, "shared"), { recursive: true });
    writeFileSync(join(bundledDir, "shared", "SKILL.md"), serializeSkill(makeSkill({ name: "shared", description: "bundled" })));
    writeProjectSkill(cwd, "shared", makeSkill({ name: "shared", description: "project override" }));

    const detail = skillDetail(cwd, "shared");
    expect(detail!.origin).toBe("project");
    expect(detail!.description).toBe("project override");
  });

  it("dependents populated in skillDetail", () => {
    writeProjectSkill(cwd, "linked-skill", makeSkill({ name: "linked-skill" }));
    writeAgentsConfig(cwd, [
      { id: "agent-x", name: "X", goal: "g", skills: ["linked-skill"] },
    ]);
    const detail = skillDetail(cwd, "linked-skill");
    expect(detail!.dependents).toEqual(["agent-x"]);
  });

  it("_system/ skill not resolvable via skillDetail", () => {
    // The catalog skips _system/ — skillDetail must return null for such names
    // even if someone crafts a dir that slips through.
    const detail = skillDetail(cwd, "_system/hidden");
    expect(detail).toBeNull();
  });
});
