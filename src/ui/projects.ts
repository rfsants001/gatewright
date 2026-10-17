// `gate projects` — list projects configured via the global registry and inspect any
// of them (doctor) from anywhere, without cd-ing into the folder.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { homedir } from "node:os";
import { ProjectRegistry } from "../core/project/registry.js";
import { runDoctor } from "./doctor.js";

const tilde = (path: string): string => path.replace(homedir(), "~");

export async function runProjects(): Promise<number> {
  const projects = new ProjectRegistry().list();
  p.intro(pc.bold(pc.cyan(" gatewright · projects ")));

  if (projects.length === 0) {
    p.outro(pc.dim("no projects configured yet — run gate init in a project"));
    return 0;
  }

  const choice = await p.select({
    message: "Configured projects",
    options: [
      ...projects.map((proj) => ({ value: proj.path, label: `${pc.bold(proj.name)} ${pc.dim(tilde(proj.path))}`, hint: proj.configuredAt.slice(0, 10) })),
      { value: "__back", label: pc.dim("← back") },
    ],
  });
  if (p.isCancel(choice) || choice === "__back") {
    p.outro(`${projects.length} project(s)`);
    return 0;
  }

  // Inspect the selected project from here.
  return runDoctor({ cwd: choice });
}
