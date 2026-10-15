import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { parseSkill, serializeSkill } from "./skill-doc.js";
import { SkillError, type Skill } from "./types.js";
import { SkillCatalog } from "./catalog.js";
import { SkillStateStore } from "./state-store.js";
import { scaffoldSkill } from "./scaffold.js";

const sampleSkill: Skill = {
  frontmatter: { name: "deploy", description: "ship it", triggers: ["deploy", "release"], skillKind: "workflows", metadata: { owner: "rafa" } },
  body: "# deploy\n\nsteps",
};

describe("SKILL.md parse/serialize", () => {
  it("round-trips stably", () => {
    const again = parseSkill(serializeSkill(sampleSkill));
    expect(again.frontmatter).toEqual(sampleSkill.frontmatter);
    expect(again.body).toBe(sampleSkill.body);
  });

  it("raises typed errors on malformed input", () => {
    expect(() => parseSkill("no frontmatter here")).toThrow(SkillError);
    expect(() => parseSkill("---\ndescription: x\n---\nbody")).toThrow(/name/);
  });
});

describe("SkillCatalog", () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), "gw-skills-"))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const writeSkill = (name: string, md: string) => {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "SKILL.md"), md);
  };

  it("lists valid skills, groups by category, resolves by name", () => {
    writeSkill("deploy", serializeSkill(sampleSkill));
    writeSkill("review", serializeSkill({ ...sampleSkill, frontmatter: { ...sampleSkill.frontmatter, name: "review", skillKind: "quality" } }));
    const catalog = new SkillCatalog(root);
    expect(catalog.list().map((s) => s.frontmatter.name).sort()).toEqual(["deploy", "review"]);
    expect(Object.keys(catalog.byCategory()).sort()).toEqual(["quality", "workflows"]);
    expect(catalog.resolve("deploy")?.frontmatter.triggers).toEqual(["deploy", "release"]);
  });

  it("collects problems for malformed skills without crashing", () => {
    writeSkill("broken", "no frontmatter");
    const catalog = new SkillCatalog(root);
    expect(catalog.list()).toHaveLength(0);
    expect(catalog.problems()[0]?.dir).toBe("broken");
  });

  it("missing root yields an empty catalog", () => {
    expect(new SkillCatalog(join(root, "nope")).list()).toEqual([]);
  });
});

describe("SkillStateStore", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-skst-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const state = () => new SkillStateStore(store, join(dir, "skills.state"));

  it("enable/disable are idempotent and persisted sorted", () => {
    const s = state();
    s.enable("b");
    s.enable("a");
    s.enable("a"); // idempotent
    expect(s.enabled()).toEqual(["a", "b"]);
    expect(s.isEnabled("a")).toBe(true);
    s.disable("a");
    s.disable("missing"); // no-op
    expect(s.enabled()).toEqual(["b"]);
  });
});

describe("scaffoldSkill", () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), "gw-scaf-"))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("creates a parseable SKILL.md and refuses to overwrite", () => {
    const { skillFile } = scaffoldSkill(root, "new-skill");
    const parsed = parseSkill(readFileSync(skillFile, "utf8"));
    expect(parsed.frontmatter.name).toBe("new-skill");
    expect(() => scaffoldSkill(root, "new-skill")).toThrow(SkillError);
  });
});
