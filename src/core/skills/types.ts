// Skills-manager contracts. The SKILL.md format mirrors a Claude Code skill
// (frontmatter: name · description · triggers · skill-kind · metadata, then a
// markdown body). We mirror the shape; the content is ours.

export interface SkillFrontmatter {
  name: string;
  description: string;
  triggers: string[];
  skillKind: string;
  metadata: Record<string, string>;
}

export interface Skill {
  frontmatter: SkillFrontmatter;
  /** Markdown body after the frontmatter block. */
  body: string;
}

export type SkillErrorCode = "NO_FRONTMATTER" | "MISSING_FIELD" | "EXISTS";

export class SkillError extends Error {
  readonly code: SkillErrorCode;
  constructor(code: SkillErrorCode, message: string) {
    super(message);
    this.name = "SkillError";
    this.code = code;
  }
}
