// `gate` (no args) — the interactive home screen. A navigable menu (not typed
// subcommands): shows a status line, then routes your selection to each flow and
// loops back until you exit. The subcommands still exist for scripting.

import * as p from "@clack/prompts";
import pc from "picocolors";
import { detect } from "../core/env/detect.js";
import { summarize } from "../core/env/types.js";
import { VERSION } from "../core/version.js";

async function statusLine(): Promise<string> {
  const spin = p.spinner();
  spin.start("scanning environment");
  const t = summarize(await detect());
  spin.stop("environment scanned");
  return `${pc.green(`${t.ok} ok`)} · ${pc.yellow(`${t.warn} warn`)} · ${pc.red(`${t.missing} to do`)}`;
}

async function route(action: string): Promise<void> {
  switch (action) {
    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      await runDoctor();
      break;
    }
    case "init": {
      const { runInit } = await import("./init.js");
      await runInit();
      break;
    }
    case "fix": {
      const { runFix } = await import("./history.js");
      await runFix();
      break;
    }
    case "dogfood": {
      const { runDogfood } = await import("./dogfood.js");
      await runDogfood();
      break;
    }
    case "projects": {
      const { runProjects } = await import("./projects.js");
      await runProjects();
      break;
    }
    case "mcp": {
      const { runMcp } = await import("./mcp.js");
      await runMcp();
      break;
    }
    case "skills": {
      const { runSkills } = await import("./skills.js");
      await runSkills();
      break;
    }
    case "history": {
      const { runHistory } = await import("./history.js");
      await runHistory();
      break;
    }
    case "rollback": {
      const { runRollback } = await import("./history.js");
      await runRollback();
      break;
    }
  }
}

export async function runHome(): Promise<number> {
  p.intro(pc.bold(pc.cyan(` gatewright ${VERSION} `)));
  p.note(await statusLine(), "Status");

  for (;;) {
    const action = await p.select({
      message: "What do you want to do?",
      options: [
        { value: "doctor", label: "Doctor", hint: "full status board" },
        { value: "init", label: "Configure this project", hint: "wizard" },
        { value: "fix", label: "Fix pending items" },
        { value: "dogfood", label: "Set up dogfood", hint: "govern a real session" },
        { value: "projects", label: "Projects", hint: "configured elsewhere" },
        { value: "mcp", label: "MCP servers" },
        { value: "skills", label: "Skills" },
        { value: "history", label: "History" },
        { value: "rollback", label: "Rollback a change" },
        { value: "exit", label: pc.dim("Exit") },
      ],
    });
    if (p.isCancel(action) || action === "exit") {
      p.outro("See you.");
      return 0;
    }
    await route(action);
  }
}
