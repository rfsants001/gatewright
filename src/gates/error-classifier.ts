// error-classifier — classifies a Bash failure signal into a concise remediation.
// Advisory only; silent on success. Clean-room reimplementation (stateless).

import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";

interface Rule {
  re: RegExp;
  hint: string;
}

// Ordered — first strong match wins.
const RULES: readonly Rule[] = [
  { re: /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i, hint: "Module not found — install dependencies or check the import path (ESM imports usually need the .js extension)." },
  { re: /command not found|: not found\b/i, hint: "Missing command/binary — ensure the dependency is installed and on PATH." },
  { re: /error TS\d+/, hint: "TypeScript type error — run your typecheck (e.g. tsc --noEmit) and fix the types." },
  { re: /npm ERR!|ERR_PNPM|\bpnpm\b.*(ERR|failed)/i, hint: "Package manager failure — read the error; often a stale lockfile (reinstall) or an incompatible Node version." },
  { re: /EACCES|permission denied/i, hint: "Permission denied — check file/dir permissions; avoid needlessly elevated operations." },
  { re: /ENOENT|no such file or directory/i, hint: "No such file/path — confirm the path relative to the current working directory before retrying." },
  { re: /ETIMEDOUT|ESOCKETTIMEDOUT|network timeout|timed out/i, hint: "Network timeout — check connectivity/proxy and retry; may be transient." },
  { re: /\b(401|403)\b|unauthorized|authentication failed|invalid token/i, hint: "Authentication failure (401/403) — check the integration's credentials/token. Never expose secrets in chat." },
  { re: /(?:https?|status|HTTP|response|code)[:/\s]+5\d{2}\b|internal server error|bad gateway|service unavailable/i, hint: "Remote server error (5xx) — usually transient; retry or check the service status." },
  { re: /fatal: |merge conflict|^CONFLICT|Automatic merge failed/im, hint: "Git error — resolve conflicts or check the repo state (git status) before continuing." },
  { re: /\bFAIL(?=\s|:|$)|Tests?:.*failed|AssertionError|✖ /m, hint: "Failing tests — read the failed assertion and run the test in isolation to find the root cause." },
];

const BENIGN = /\b0 errors?\b|no errors?\b|build succeeded|✓ |all tests passed|passed\b/i;
const GENERIC = "Error detected in the command output — read the message above before retrying.";

function classify(text: string, stderr: string): string | null {
  for (const rule of RULES) if (rule.re.test(text)) return rule.hint;
  if (stderr.trim() && /\b(error|exception|traceback)\b/i.test(stderr) && !BENIGN.test(text)) return GENERIC;
  return null;
}

export function errorClassifier(): Gate {
  return {
    name: "error-classifier",
    description: "Classifies a failed Bash command and advises a remediation.",
    events: ["post-bash"],
    appliesTo: (ctx) => ctx.event === "post-bash",
    check: (ctx: GateContext): GateDecision => {
      const tr = ctx.toolResponse;
      if (!tr || typeof tr !== "object") return { kind: "allow" };
      const r = tr as Record<string, unknown>;
      const stdout = typeof r["stdout"] === "string" ? r["stdout"] : "";
      const stderr = typeof r["stderr"] === "string" ? r["stderr"] : "";
      const text = `${stdout}\n${stderr}`;
      if (!text.trim()) return { kind: "allow" };
      const hint = classify(text, stderr);
      return hint ? { kind: "advise", message: `[error-classifier] ${hint}` } : { kind: "allow" };
    },
  };
}
