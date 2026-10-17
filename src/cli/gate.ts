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
          "  (none)        dashboard — machine overview + actions",
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

// Interactive/async commands → each resolves to an exit code. Returns null when the
// command was not handled here (so `main` handles the synchronous ones).
async function runAsyncCommand(argv: string[]): Promise<number | null> {
  const app = async (route?: Parameters<typeof import("../ui/app.js").runApp>[0]) => (await import("../ui/app.js")).runApp(route);
  const plain = () => import("../ui/plain.js");
  switch (argv[0]) {
    // Interactive, mutating flows → the Ink app, opened at the right screen.
    case "dashboard":
      return app();
    case "init":
      return app("config");
    case "fix":
      return app("fix");
    case "dogfood":
      return app("dogfood");
    case "rollback":
      return argv[1] ? (await plain()).textRollback(argv[1]) : app("rollback");
    case "ui":
      return (await import("../ui/components/gallery.js")).runGallery();
    // Read-only / scriptable → plain text (headless-friendly).
    case "doctor":
      return (await plain()).textDoctor();
    case "history":
      return (await plain()).textHistory();
    case "projects":
      return (await plain()).textProjects();
    case "mcp":
      return (await plain()).textMcp();
    case "skills":
      return (await plain()).textSkills();
    case undefined:
      return process.stdin.isTTY && process.stdout.isTTY ? app() : null;
    default:
      return null;
  }
}

// Entry point. Wrapped in an async function (not top-level await) to avoid Node's
// "unsettled top-level await" warning while the dashboard loop or MCP server runs.
async function cli(argv: string[]): Promise<void> {
  if (argv[0] === "serve") {
    const { serveStdio } = await import("../mcp/server.js");
    const server = await serveStdio();
    const shutdown = (): void => {
      void server.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return; // server keeps the process alive
  }

  const code = await runAsyncCommand(argv);
  process.exit(code ?? main(argv));
}

void cli(process.argv.slice(2));
