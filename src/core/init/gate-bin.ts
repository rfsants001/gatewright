// How to invoke `gate` from configs we write (hooks, MCP). We can't rely on `gate`
// being on PATH (it only is after `npm link`), and the hook shell is often a bare
// /bin/sh. So we write an absolute invocation: the current Node binary + the resolved
// CLI script path. This works regardless of PATH.

import { fileURLToPath } from "node:url";

/** Absolute path to the built CLI entry (dist/cli/gate.js) relative to this module. */
export function gateScript(): string {
  return fileURLToPath(new URL("../../cli/gate.js", import.meta.url));
}

/** Shell command string for a lifecycle hook (PreToolUse, etc.). */
export function gateHookCommand(): string {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(gateScript())} hook`;
}

/** command/args form for an MCP server entry (.mcp.json). */
export function gateServeInvocation(): { command: string; args: string[] } {
  return { command: process.execPath, args: [gateScript(), "serve"] };
}

/** Whether a hook command string is one of ours (bare `gate hook` or absolute form). */
export function isGateHookCommand(command: unknown): boolean {
  return typeof command === "string" && /\bgate(?:\.[cm]?js)?\b/.test(command) && /\bhook\b/.test(command);
}
