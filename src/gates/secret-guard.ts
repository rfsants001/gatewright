// secret-guard — blocks reading secret files into the model context (OWASP A02).
// Reading leaks; writing/creating a secret file is legitimate and never blocked.
// Clean-room: logic rewritten from observed behavior, no third-party code.

import { basename } from "node:path";
import type { Gate, GateContext, GateDecision } from "../core/gate/types.js";

const DEFAULT_PATTERNS: readonly RegExp[] = [
  /^\.env(\.[a-z0-9_-]+)?$/,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /\.(pem|p12|pfx)$/i,
];

// Non-secret env variants (templates/defaults) — always allowed, fixed, never configurable.
const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist|defaults?|schema|test|spec|config)$/i;

// Bash verbs that PRINT/READ file content (the exfiltration vector). cp/mv/scp are excluded —
// moving a secret file doesn't dump its content into the context.
const READER = /^(cat|bat|less|more|head|tail|nl|xxd|od|strings|base64|openssl|grep|rg|egrep|fgrep|awk|sed|cut)$/i;
// grep/rg/sed/awk take a PATTERN/PROGRAM as the first operand — a secret there is a search term, not a file read.
const PATTERN_FIRST = /^(grep|egrep|fgrep|rg|sed|awk)$/i;

function isSecretPath(p: string | undefined, patterns: readonly RegExp[]): boolean {
  if (!p) return false;
  const base = basename(String(p).trim().replace(/["']/g, ""));
  if (ENV_TEMPLATE.test(base)) return false;
  return patterns.some((re) => re.test(base));
}

// True when some command segment READS the content of a secret file (not merely names it).
function readsSecretContent(command: string, patterns: readonly RegExp[]): boolean {
  for (const seg of command.split(/\||;|\n|&&/)) {
    const tokens = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length && /^\w+=/.test(tokens[i] ?? "")) i++; // skip env-assignments (FOO=bar) before the verb
    const verb = tokens[i];
    if (!verb || !READER.test(verb)) continue;
    const operands = tokens.slice(i + 1).filter((t) => !t.startsWith("-") && !/^\w+=/.test(t));
    const fileOperands = PATTERN_FIRST.test(verb) ? operands.slice(1) : operands; // first operand is the pattern
    if (fileOperands.some((t) => isSecretPath(t, patterns))) return true;
  }
  return false;
}

const DENY: GateDecision = {
  kind: "deny",
  reason:
    "secret-guard blocked reading a secret file into the model context (OWASP A02). " +
    "Reference the variable by name or read the value outside the session. Templates like .env.example are allowed.",
};

export function secretGuard(options: { patterns?: readonly RegExp[] } = {}): Gate {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  return {
    name: "secret-guard",
    description: "Blocks reading secret files into the model context.",
    events: ["pre-read", "pre-bash"],
    appliesTo: (ctx) => ctx.event === "pre-read" || ctx.event === "pre-bash",
    check: (ctx: GateContext): GateDecision => {
      const ti = ctx.toolInput ?? {};
      if (ctx.event === "pre-read") {
        const fp = (ti["file_path"] ?? ti["filePath"] ?? ti["path"]) as string | undefined;
        if (isSecretPath(fp, patterns)) return DENY;
      } else {
        const command = String(ti["command"] ?? "");
        if (command) {
          // Drop heredoc bodies and redirect targets (those WRITE, not read).
          const stripped = (command.split(/<<[-~]?\s*['"]?\w+/)[0] ?? "").replace(/[12]?>>?\s*\S+/g, " ");
          if (readsSecretContent(stripped, patterns)) return DENY;
        }
      }
      return { kind: "allow" };
    },
  };
}
