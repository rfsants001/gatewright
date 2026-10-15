// Skill scaffold — `gate skill new <name>` writes a minimal valid SKILL.md plus a
// references/ folder under the catalog root. Refuses to overwrite an existing skill.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeSkill } from "./skill-doc.js";
import { SkillError, type Skill } from "./types.js";

export interface ScaffoldResult {
  dir: string;
  skillFile: string;
}

/** Create <root>/<name>/{SKILL.md, references/}. Existing dir → SkillError("EXISTS"). */
export function scaffoldSkill(root: string, name: string, skillKind = "general"): ScaffoldResult {
  const dir = join(root, name);
  if (existsSync(dir)) throw new SkillError("EXISTS", `skill '${name}' already exists at ${dir}`);

  const skill: Skill = {
    frontmatter: {
      name,
      description: `TODO: one-line description of ${name} (and when to use it).`,
      triggers: [],
      skillKind,
      metadata: {},
    },
    body: `# ${name}\n\nTODO: skill instructions.\n`,
  };

  const skillFile = join(dir, "SKILL.md");
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(skillFile, serializeSkill(skill), "utf8");
  return { dir, skillFile };
}
