#!/usr/bin/env node
// gate — Gatewright CLI entrypoint.

import { readFileSync } from "node:fs";
import { runHook } from "../host/run-hook.js";

const VERSION = "0.0.0";

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
          "Usage: gate <command> [options]",
          "",
          "Commands (planned):",
          "  init          scaffold gate config in the current repo",
          "  serve         start the local MCP server",
          "  run <gate>    run a single gate against the working tree",
          "  skill         list | new — manage skills",
          "  jev           configure the local-AI decision engine",
          "  doctor        diagnose the setup",
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

process.exit(main(process.argv.slice(2)));
