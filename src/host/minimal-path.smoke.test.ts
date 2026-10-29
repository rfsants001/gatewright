// Smoke test — the minimal protected path works with no Jev and no network.
// Feeds a realistic Claude Code PreToolUse hook payload (Read of a secret file) through the
// real `runHook` entrypoint and asserts a legible refusal. Uses `runHook` (NOT runHookWithJev),
// so no local model is consulted. No Ollama, no git, no ~/.gatewright state — this is the
// floor that any fresh install must clear (R0-005).

import { describe, it, expect } from "vitest";
import { runHook } from "./run-hook.js";

describe("minimal protected path (no Jev, no network)", () => {
  it("refuses reading a secret file with a legible reason", () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: ".env" },
      session_id: "smoke-min-1",
    });

    const out = runHook(payload);

    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    // Legible: names the gate and gives guidance, not an opaque code.
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/secret-guard/i);
    expect(parsed.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(20);
  });

  it("allows an ordinary read (no false positive on the happy path)", () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "src/index.ts" },
      session_id: "smoke-min-2",
    });

    const out = runHook(payload);

    // Silent allow = empty stdout, exit 0.
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("allows a template env variant (.env.example is not a secret)", () => {
    const payload = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: ".env.example" },
      session_id: "smoke-min-3",
    });

    const out = runHook(payload);

    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });
});
