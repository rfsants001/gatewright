// How to invoke `gate` from configs we write (hooks, MCP). We can't rely on `gate`
// being on PATH (it only is after `npm link`), and the hook shell is often a bare
// /bin/sh. So we write an absolute invocation: the current Node binary + the resolved
// CLI script path. This works regardless of PATH.

import { fileURLToPath } from "node:url";

/** Absolute path to the built CLI entry (dist/cli/gate.js) relative to this module. */
export function gateScript(): string {
  return fileURLToPath(new URL("../../cli/gate.js", import.meta.url));
}

/** Packaged Electron is also our Node runtime, including when called by an external host. */
export function gateRuntimeEnvironment(): Record<string, string> {
  return process.env["ELECTRON_RUN_AS_NODE"] === "1" ? { ELECTRON_RUN_AS_NODE: "1" } : {};
}

/** Shell command string for a lifecycle hook (PreToolUse, etc.). */
export function gateHookCommand(host?: string): string {
  const prefix = process.env["ELECTRON_RUN_AS_NODE"] === "1" ? process.platform === "win32" ? 'set "ELECTRON_RUN_AS_NODE=1" && ' : "ELECTRON_RUN_AS_NODE=1 " : "";
  return `${prefix}${JSON.stringify(process.execPath)} ${JSON.stringify(gateScript())} hook${host ? ` ${host}` : ""}`;
}

/** command/args form for an MCP server entry (.mcp.json). */
export function gateServeInvocation(cwd?: string): { command: string; args: string[]; env?: Record<string, string> } {
  const env = gateRuntimeEnvironment();
  return { command: process.execPath, args: [gateScript(), "serve", ...(cwd ? [cwd] : [])], ...(Object.keys(env).length ? { env } : {}) };
}

/** Whether a hook command string is one of ours (bare `gate hook` or absolute form). */
export function isGateHookCommand(command: unknown): boolean {
  return typeof command === "string" && /\bgate(?:\.[cm]?js)?\b/.test(command) && /\bhook\b/.test(command);
}
