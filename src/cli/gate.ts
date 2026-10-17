#!/usr/bin/env node
// gate — Gatewright CLI entrypoint.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "../host/run-hook.js";
import { SkillCatalog } from "../core/skills/catalog.js";
import { scaffoldSkill } from "../core/skills/scaffold.js";
import { SkillError } from "../core/skills/types.js";
import { runReplay } from "../core/replay/cli.js";
import { VERSION } from "../core/version.js";

function printChangelog(): number {
  const path = new URL("../../CHANGELOG.md", import.meta.url);
  if (!existsSync(path)) {
    process.stdout.write(`gate ${VERSION} — no CHANGELOG.md found\n`);
    return 0;
  }
  process.stdout.write(`${readFileSync(path, "utf8")}\n`);
  return 0;
}

function skillsRoot(): string {
  return process.env.GATEWRIGHT_SKILLS_DIR ?? join(process.cwd(), "skills");
}

function skillCommand(args: string[]): number {
  const [sub, name] = args;
  if (sub === "list") {
    const catalog = new SkillCatalog(skillsRoot());
    for (const skill of catalog.list()) {
      process.stdout.write(`${skill.frontmatter.name}  [${skill.frontmatter.skillKind}]  ${skill.frontmatter.description}\n`);
    }
    for (const p of catalog.problems()) process.stderr.write(`skipped ${p.dir}: ${p.message}\n`);
    return 0;
  }
  if (sub === "new") {
    if (!name) {
      process.stderr.write("gate skill new: missing <name>. Usage: gate skill new <name>\n");
      return 1;
    }
    try {
      const { skillFile } = scaffoldSkill(skillsRoot(), name);
      process.stdout.write(`created ${skillFile}\n`);
      return 0;
    } catch (e) {
      if (e instanceof SkillError) {
        process.stderr.write(`gate skill new: ${e.message}\n`);
        return 1;
      }
      throw e;
    }
  }
  process.stderr.write("gate skill: expected 'list' or 'new <name>'.\n");
  return 1;
}

function main(argv: string[]): number {
  const [cmd] = argv;
  switch (cmd) {
    case "hook": {
      let raw = "";
      try {
        raw = readFileSync(0, "utf8");
      } catch {
        raw = "";
      }
      const out = runHook(raw);
      if (out.stdout) process.stdout.write(`${out.stdout}\n`);
      return out.exitCode;
    }
    case "skill":
      return skillCommand(argv.slice(1));
    case "replay": {
      const out = runReplay(argv.slice(1));
      process.stdout.write(out.stdout);
      return out.exitCode;
    }
    case "changelog":
      return printChangelog();
    case "--version":
    case "-v":
      process.stdout.write(`gate ${VERSION}\n`);
      return 0;
    case undefined:
    case "--help":
    case "-h":
      process.stdout.write(
        [
          "gate — Gatewright (headless guardrails for AI code agents)",
          "",
          "Run `gate` with no arguments for the interactive home screen.",
          "",
          "Usage: gate [command] [options]",
          "",
          "Interactive screens:",
          "  (none)        home screen — navigate everything",
          "  doctor        diagnose the setup (status board)",
          "  init          self-configure this project (wizard)",
          "  fix           configure only selected pending items",
          "  dogfood       set up governance for a real session",
          "  projects      projects configured elsewhere",
          "  mcp           list / register MCP servers",
          "  skills        list / scaffold skills",
          "  history       configuration change history",
          "  rollback [id] revert a configuration change",
          "",
          "Headless / scripting:",
          "  hook          run the gate hook (stdin → decision)",
          "  serve         start the local MCP server",
          "  replay        reconstruct a run's state from its journal",
          "  changelog     print the changelog",
          "",
          `version: ${VERSION}`,
        ].join("\n") + "\n",
      );
      return 0;
    default:
      process.stderr.write(`gate: unknown command '${cmd}'. Try 'gate --help'.\n`);
      return 1;
  }
}

const argv = process.argv.slice(2);
if (argv[0] === "serve") {
  const { serveStdio } = await import("../mcp/server.js");
  const server = await serveStdio();
  const shutdown = (): void => {
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else if (argv[0] === "doctor") {
  const { runDoctor } = await import("../ui/doctor.js");
  process.exit(await runDoctor());
} else if (argv[0] === "init") {
  const { runInit } = await import("../ui/init.js");
  process.exit(await runInit());
} else if (argv[0] === "fix") {
  const { runFix } = await import("../ui/history.js");
  process.exit(await runFix());
} else if (argv[0] === "history") {
  const { runHistory } = await import("../ui/history.js");
  process.exit(await runHistory());
} else if (argv[0] === "rollback") {
  const { runRollback } = await import("../ui/history.js");
  process.exit(await runRollback(argv[1]));
} else if (argv[0] === "dogfood") {
  const { runDogfood } = await import("../ui/dogfood.js");
  process.exit(await runDogfood());
} else if (argv[0] === "projects") {
  const { runProjects } = await import("../ui/projects.js");
  process.exit(await runProjects());
} else if (argv[0] === "mcp") {
  const { runMcp } = await import("../ui/mcp.js");
  process.exit(await runMcp());
} else if (argv[0] === "skills") {
  const { runSkills } = await import("../ui/skills.js");
  process.exit(await runSkills());
} else if (argv[0] === "ui") {
  const { runGallery } = await import("../ui/components/gallery.js");
  process.exit(await runGallery());
} else if (argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
  // No command in an interactive terminal → launch the home screen.
  const { runHome } = await import("../ui/home.js");
  process.exit(await runHome());
} else {
  process.exit(main(argv));
}
