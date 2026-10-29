// R0.5-004 — Document and test the CURRENT MCP-tool fall-through behaviour.
//
// Finding (verified here): A Claude Code hook payload whose `tool_name` matches
// the MCP convention `mcp__<server>__<tool>` is NOT governed by any gate today.
//
// Why: `mapEvent` in `src/host/claude-code.ts` only recognises native tool names
// (Read, Edit, Write, Bash, run_in_terminal, …). An MCP tool call whose
// `tool_name` does not match any of those branches causes `mapEvent` to return
// `null` → `parseClaudeCodeEvent` returns `null` → `runHook` returns
// `{stdout:"",exitCode:0}` (silent allow). No gate runs.
//
// This is a DOCUMENTED, intentional-for-now behaviour. The tests below PROVE it.
//
// OUT OF SCOPE (F18): implementing a generic GateEvent or tool policy for MCP
// tools. Tracked as F18 backlog item. Reference: docs/governance-coverage.md row 12.

import { describe, expect, it } from "vitest";
import { parseClaudeCodeEvent } from "./claude-code.js";
import { runHook } from "./run-hook.js";

function silentAllow(out: { stdout: string; exitCode: number }): boolean {
  return out.stdout === "" && out.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Core MCP fall-through proof
// ---------------------------------------------------------------------------

describe("MCP-tool fall-through (current behaviour — row 12 in governance-coverage.md)", () => {
  it("mcp__* tool_name → mapEvent returns null (no GateEvent matched)", () => {
    // This is the exact mechanism: mapEvent does not handle mcp__* names.
    const ctx = parseClaudeCodeEvent(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "mcp__files__read_file",
        tool_input: { path: ".env" },
        session_id: "mcp-1",
        cwd: "/workspace",
      }),
    );
    // parseClaudeCodeEvent returns null when mapEvent returns null.
    expect(ctx).toBeNull();
  });

  it("mcp__* PreToolUse → runHook silent allow (no gate intercepts)", () => {
    // Even when the MCP tool reads a secret file (.env), no gate runs → allow.
    // This is the documented gap: secret-guard does NOT protect MCP reads today.
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "mcp__files__read_file",
        tool_input: { path: ".env" },
        session_id: "mcp-2",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("mcp__* PostToolUse → runHook silent allow (error-classifier does not run)", () => {
    // Even with a clear error in the tool response, no gate advises.
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "mcp__bash__run_command",
        tool_response: { stderr: "ENOENT: no such file or directory" },
        session_id: "mcp-3",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contrast: native equivalent DOES get governed
// ---------------------------------------------------------------------------

describe("contrast: native equivalent of MCP tool IS governed", () => {
  it("native Read of .env → deny (secret-guard acts)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: ".env" },
        session_id: "mcp-contrast-1",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("native Bash with ENOENT → advise (error-classifier acts)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_response: { stderr: "ENOENT: no such file or directory" },
        session_id: "mcp-contrast-2",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { systemMessage: string };
    expect(parsed.systemMessage).toMatch(/error-classifier/i);
  });
});

// ---------------------------------------------------------------------------
// Additional MCP tool name variants — all fall through
// ---------------------------------------------------------------------------

describe("MCP tool name variants — all fall-through to allow", () => {
  const mcpTools = [
    "mcp__filesystem__write_file",
    "mcp__github__create_issue",
    "mcp__shell__execute",
    "mcp__serena__find_symbol",
    "mcp__gatewright__check_gate",
    "mcp__claude_ai_Google_Drive__read_file_content",
  ];

  for (const tool of mcpTools) {
    it(`${tool} → parseClaudeCodeEvent returns null`, () => {
      const ctx = parseClaudeCodeEvent(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: tool,
          tool_input: { path: ".env", file_path: ".env" },
          session_id: `mcp-variant-${tool}`,
          cwd: "/workspace",
        }),
      );
      expect(ctx).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// F18 backlog note (comment-only, no assertions)
// Implementing a generic GateEvent for MCP tools is tracked as F18.
// When F18 is implemented, these tests must be updated — the fall-through
// behaviour will no longer hold for governed MCP events.
// ---------------------------------------------------------------------------
