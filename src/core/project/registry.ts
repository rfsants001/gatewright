// ProjectRegistry — a global index of configured projects at
// ~/.gatewright/projects.json, so the CLI can list and operate on projects from
// anywhere (not only from inside a project folder).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProjectEntry {
  /** Absolute project root path (the key). */
  path: string;
  name: string;
  /** ISO-8601 of last `gate init`. */
  configuredAt: string;
  /** Free-form flags, e.g. which hosts/jev were wired. */
  meta?: Record<string, unknown>;
}

interface RegistryFile {
  version: number;
  projects: Record<string, ProjectEntry>;
}

/** Default path of the global project registry. Overridable via GATEWRIGHT_PROJECTS. */
export function projectsPath(): string {
  return process.env.GATEWRIGHT_PROJECTS ?? join(homedir(), ".gatewright", "projects.json");
}

export class ProjectRegistry {
  readonly #path: string;

  constructor(path: string = projectsPath()) {
    this.#path = path;
  }

  #read(): RegistryFile {
    if (!existsSync(this.#path)) return { version: 1, projects: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.#path, "utf8")) as Partial<RegistryFile>;
      return { version: 1, projects: parsed.projects ?? {} };
    } catch {
      return { version: 1, projects: {} };
    }
  }

  #write(file: RegistryFile): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }

  /** Add or update a project (idempotent by path). */
  register(entry: ProjectEntry): this {
    const file = this.#read();
    file.projects[entry.path] = entry;
    this.#write(file);
    return this;
  }

  get(path: string): ProjectEntry | undefined {
    return this.#read().projects[path];
  }

  /** All projects, path-sorted. */
  list(): ProjectEntry[] {
    return Object.values(this.#read().projects).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  remove(path: string): void {
    const file = this.#read();
    if (path in file.projects) {
      delete file.projects[path];
      this.#write(file);
    }
  }
}
