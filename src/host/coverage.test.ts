// R0.5-001 — Coverage guard: each path documented as "Tested: yes" in
// docs/governance-coverage.md must produce the declared decision.
// If any path regresses, this file fails — the matrix is not a doc that rots.
//
// This file covers the minimal structural invariants (one assertion per path).
// Deeper behavioral coverage lives in paths-native.e2e.test.ts,
// paths-stop.e2e.test.ts, and paths-mcp.e2e.test.ts.

import { describe, expect, it } from "vitest";
import { parseClaudeCodeEvent } from "./claude-code.js";
import { runHook } from "./run-hook.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payload(hookEvent: string, toolName?: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ hook_event_name: hookEvent, tool_name: toolName, cwd: "/tmp/cov", ...extra });
}

function silentAllow(out: { stdout: string; exitCode: number }): boolean {
  return out.stdout === "" && out.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Row 1 & 2 — pre-read (Read + read_file) → secret-guard may deny
// ---------------------------------------------------------------------------

describe("coverage row 1-2: pre-read", () => {
  it("Read of a secret file → deny", () => {
    const out = runHook(payload("PreToolUse", "Read", { tool_input: { file_path: ".env" } }));
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("read_file of a secret file → deny", () => {
    const out = runHook(payload("PreToolUse", "read_file", { tool_input: { file_path: ".env" } }));
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Read of a normal file → allow (silent)", () => {
    const out = runHook(payload("PreToolUse", "Read", { tool_input: { file_path: "src/index.ts" } }));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rows 3–5 — pre-edit (Edit, Write, MultiEdit) → no gate in defaultRegistry
// ---------------------------------------------------------------------------

describe("coverage rows 3-5: pre-edit", () => {
  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    it(`${tool} PreToolUse maps to pre-edit and allows (no gate in default registry)`, () => {
      const ctx = parseClaudeCodeEvent(payload("PreToolUse", tool));
      expect(ctx?.event).toBe("pre-edit");
      const out = runHook(payload("PreToolUse", tool, { tool_input: { file_path: "src/foo.ts" } }));
      expect(silentAllow(out)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Rows 6–7 — pre-bash (Bash + run_in_terminal) → secret-guard
// ---------------------------------------------------------------------------

describe("coverage rows 6-7: pre-bash", () => {
  it("Bash reading a secret → deny", () => {
    const out = runHook(payload("PreToolUse", "Bash", { tool_input: { command: "cat .env" } }));
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("run_in_terminal reading a secret → deny", () => {
    const out = runHook(payload("PreToolUse", "run_in_terminal", { tool_input: { command: "cat .env" } }));
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Bash ordinary command → allow", () => {
    const out = runHook(payload("PreToolUse", "Bash", { tool_input: { command: "npm test" } }));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 8 — post-bash (Bash) → error-classifier
// ---------------------------------------------------------------------------

describe("coverage row 8: post-bash", () => {
  it("Bash with ENOENT stderr → advise", () => {
    const out = runHook(
      payload("PostToolUse", "Bash", { tool_response: { stdout: "", stderr: "ENOENT: no such file or directory" } }),
    );
    const parsed = JSON.parse(out.stdout) as { systemMessage: string };
    expect(parsed.systemMessage).toContain("error-classifier");
  });

  it("Bash with clean output → allow", () => {
    const out = runHook(payload("PostToolUse", "Bash", { tool_response: { stdout: "ok", stderr: "" } }));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 9 — post-edit (Edit) → verify-on-edit
// ---------------------------------------------------------------------------

describe("coverage row 9: post-edit", () => {
  it("Edit PostToolUse maps to post-edit", () => {
    const ctx = parseClaudeCodeEvent(payload("PostToolUse", "Edit"));
    expect(ctx?.event).toBe("post-edit");
  });

  it("Edit PostToolUse with non-existent file → allow (verify-on-edit skips missing files)", () => {
    const out = runHook(
      payload("PostToolUse", "Edit", { tool_input: { file_path: "/tmp/does-not-exist-gw.ts" } }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 10 — stop → proportion-gate
// ---------------------------------------------------------------------------

describe("coverage row 10: stop", () => {
  it("Stop maps to stop event", () => {
    const ctx = parseClaudeCodeEvent(payload("Stop"));
    expect(ctx?.event).toBe("stop");
  });

  it("Stop in a dir with no git repo → allow (proportion-gate: no changes)", () => {
    // /tmp has no .git → proportion-gate returns allow.
    const out = runHook(payload("Stop"));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 11 — subagent-stop → no gate in defaultRegistry (quality-gate needs native flow)
// ---------------------------------------------------------------------------

describe("coverage row 11: subagent-stop", () => {
  it("SubagentStop maps to subagent-stop event", () => {
    const ctx = parseClaudeCodeEvent(payload("SubagentStop"));
    expect(ctx?.event).toBe("subagent-stop");
  });

  it("SubagentStop → allow (quality-gate not in defaultRegistry)", () => {
    const out = runHook(payload("SubagentStop"));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 12 — MCP tool call → fall-through → allow
// ---------------------------------------------------------------------------

describe("coverage row 12: MCP-tool fall-through", () => {
  it("mcp__* tool_name → mapEvent returns null → parseClaudeCodeEvent returns null", () => {
    const ctx = parseClaudeCodeEvent(payload("PreToolUse", "mcp__files__read_file"));
    expect(ctx).toBeNull();
  });

  it("mcp__* PreToolUse → runHook silent allow (no gate runs)", () => {
    const out = runHook(
      payload("PreToolUse", "mcp__files__read_file", { tool_input: { path: ".env" } }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 13 — unknown/ungoverned tool → fall-through → allow
// ---------------------------------------------------------------------------

describe("coverage row 13: unknown tool fall-through", () => {
  it("unknown tool PreToolUse → parseClaudeCodeEvent returns null", () => {
    expect(parseClaudeCodeEvent(payload("PreToolUse", "Grep"))).toBeNull();
  });

  it("unknown tool → runHook silent allow", () => {
    const out = runHook(payload("PreToolUse", "Grep"));
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row 14 — malformed payload → fall-through → allow
// ---------------------------------------------------------------------------

describe("coverage row 14: malformed payload", () => {
  it("invalid JSON → runHook silent allow", () => {
    const out = runHook("not json at all {{");
    expect(silentAllow(out)).toBe(true);
  });

  it("non-record JSON → runHook silent allow", () => {
    const out = runHook(JSON.stringify([1, 2, 3]));
    expect(silentAllow(out)).toBe(true);
  });
});
