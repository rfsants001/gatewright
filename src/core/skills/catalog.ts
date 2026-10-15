// SkillCatalog — reads a directory of skills (each skill = a subdir with SKILL.md),
// lists them by category (skill-kind), and resolves by name. Tolerant: a malformed
// SKILL.md is collected in `problems()` and skipped, never crashing the catalog.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSkill } from "./skill-doc.js";
import type { Skill } from "./types.js";

export interface CatalogProblem {
  dir: string;
  message: string;
}

export class SkillCatalog {
  readonly #root: string;
  #skills: Skill[] = [];
  #problems: CatalogProblem[] = [];
  #loaded = false;

  constructor(root: string) {
    this.#root = root;
  }

  #load(): void {
    this.#skills = [];
    this.#problems = [];
    if (!existsSync(this.#root)) {
      this.#loaded = true;
      return;
    }
    for (const entry of readdirSync(this.#root).sort()) {
      const dir = join(this.#root, entry);
      if (!statSync(dir).isDirectory()) continue;
      const file = join(dir, "SKILL.md");
      if (!existsSync(file)) continue;
      try {
        this.#skills.push(parseSkill(readFileSync(file, "utf8")));
      } catch (e) {
        this.#problems.push({ dir: entry, message: (e as Error).message });
      }
    }
    this.#loaded = true;
  }

  #ensure(): void {
    if (!this.#loaded) this.#load();
  }

  /** Force a re-read from disk (after installing a new skill). */
  reload(): void {
    this.#load();
  }

  list(): Skill[] {
    this.#ensure();
    return [...this.#skills];
  }

  problems(): CatalogProblem[] {
    this.#ensure();
    return [...this.#problems];
  }

  resolve(name: string): Skill | undefined {
    this.#ensure();
    return this.#skills.find((s) => s.frontmatter.name === name);
  }

  byCategory(): Record<string, Skill[]> {
    this.#ensure();
    const out: Record<string, Skill[]> = {};
    for (const skill of this.#skills) {
      (out[skill.frontmatter.skillKind] ??= []).push(skill);
    }
    return out;
  }
}
