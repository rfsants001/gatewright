// `gate skills` (TUI) — list the skill catalog and scaffold a new skill by name.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { join } from "node:path";
import { SkillCatalog } from "../core/skills/catalog.js";
import { scaffoldSkill } from "../core/skills/scaffold.js";
import { SkillError } from "../core/skills/types.js";

function skillsRoot(): string {
  return process.env.GATEWRIGHT_SKILLS_DIR ?? join(process.cwd(), "skills");
}

export async function runSkills(): Promise<number> {
  const root = skillsRoot();
  const catalog = new SkillCatalog(root);
  const skills = catalog.list();
  p.intro(pc.bold(pc.cyan(" gatewright · skills ")));

  p.note(
    skills.length > 0
      ? skills.map((s) => `${pc.bold(s.frontmatter.name)} ${pc.dim(`[${s.frontmatter.skillKind}]`)} ${s.frontmatter.description}`).join("\n")
      : pc.dim(`no skills in ${root}`),
    "Skills",
  );

  const create = await p.confirm({ message: "Scaffold a new skill?", initialValue: false });
  if (p.isCancel(create) || !create) {
    p.outro(`${skills.length} skill(s)`);
    return 0;
  }

  const name = await p.text({ message: "Skill name", placeholder: "my-skill", validate: (v) => (v && v.trim() ? undefined : "name is required") });
  if (p.isCancel(name)) {
    p.cancel("No skill created.");
    return 1;
  }

  try {
    const { skillFile } = scaffoldSkill(root, name.trim());
    p.outro(`${pc.green("✓")} created ${skillFile}`);
    return 0;
  } catch (e) {
    p.cancel(e instanceof SkillError ? e.message : String(e));
    return 1;
  }
}
