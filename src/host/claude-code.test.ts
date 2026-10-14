import { describe, expect, it } from "vitest";
import type { GateContext } from "../core/gate/types.js";
import type { EngineResult } from "../core/gate/engine.js";
import { parseClaudeCodeEvent, renderClaudeCodeDecision } from "./claude-code.js";
import { runHook } from "./run-hook.js";

describe("parseClaudeCodeEvent", () => {
  const ev = (hook: string, tool?: string) =>
    parseClaudeCodeEvent(JSON.stringify({ hook_event_name: hook, tool_name: tool, cwd: "/w" }))?.event;

  it("maps host events + tools to gate events", () => {
    expect(ev("PreToolUse", "Read")).toBe("pre-read");
    expect(ev("PreToolUse", "Edit")).toBe("pre-edit");
    expect(ev("PreToolUse", "Bash")).toBe("pre-bash");
    expect(ev("PostToolUse", "Bash")).toBe("post-bash");
    expect(ev("PostToolUse", "Write")).toBe("post-edit");
    expect(ev("Stop")).toBe("stop");
  });

  it("returns null for ungoverned or malformed events", () => {
    expect(parseClaudeCodeEvent(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Grep" }))).toBeNull();
    expect(parseClaudeCodeEvent("not json")).toBeNull();
  });

  it("extracts payload fields", () => {
    const ctx = parseClaudeCodeEvent(
      JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: "/w", session_id: "s1" }),
    );
    expect(ctx?.toolInput).toEqual({ command: "ls" });
    expect(ctx?.sessionKey).toBe("s1");
  });
});

describe("renderClaudeCodeDecision", () => {
  const ctx = (event: GateContext["event"]): GateContext => ({ event, cwd: "/w" });
  const result = (decision: EngineResult["decision"]): EngineResult => ({ decision, errors: [] });

  it("renders allow as silence", () => {
    expect(renderClaudeCodeDecision(result({ kind: "allow" }), ctx("pre-read"))).toEqual({ stdout: "", exitCode: 0 });
  });

  it("renders advise as systemMessage", () => {
    const out = renderClaudeCodeDecision(result({ kind: "advise", message: "hi" }), ctx("post-bash"));
    expect(JSON.parse(out.stdout)).toEqual({ systemMessage: "hi" });
  });

  it("renders a pre-event deny as permissionDecision", () => {
    const out = renderClaudeCodeDecision(result({ kind: "deny", reason: "no" }), ctx("pre-read"));
    expect(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("renders a stop deny as a block decision", () => {
    const out = renderClaudeCodeDecision(result({ kind: "deny", reason: "no" }), ctx("stop"));
    expect(JSON.parse(out.stdout)).toEqual({ decision: "block", reason: "no" });
  });
});

describe("runHook (end to end)", () => {
  it("denies reading a secret file", () => {
    const out = runHook(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/p/.env" } }));
    expect(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("advises on a failing bash command", () => {
    const out = runHook(
      JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: { stderr: "ENOENT: no such file" } }),
    );
    expect(JSON.parse(out.stdout).systemMessage).toContain("error-classifier");
  });

  it("is silent for a normal read and fail-open for garbage", () => {
    expect(runHook(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/p/foo.js" } }))).toEqual({ stdout: "", exitCode: 0 });
    expect(runHook("garbage")).toEqual({ stdout: "", exitCode: 0 });
  });
});
