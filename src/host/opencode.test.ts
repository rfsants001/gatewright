import { describe, expect, it } from "vitest";
import { opencodeHookAdapter } from "./opencode.js";
import { runHook } from "./run-hook.js";

function payload(hook_event_name: string, tool_name?: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ hook_event_name, tool_name, cwd: "/tmp/oc", ...extra });
}

describe("opencode hook adapter", () => {
  it("maps a native read of a secret file to a deny", () => {
    const out = runHook(payload("execute.before", "read", { tool_input: { file_path: ".env" } }), opencodeHookAdapter);
    expect(JSON.parse(out.stdout).decision).toBe("deny");
  });

  it("remaps execute.before + native tool names to the claude event space", () => {
    const ctx = opencodeHookAdapter.parse(payload("execute.before", "edit", { tool_input: { file_path: "src/a.ts" } }));
    expect(ctx?.event).toBe("pre-edit");
    expect(ctx?.toolName).toBe("Edit");
  });

  it("maps execute.after to a post event", () => {
    const ctx = opencodeHookAdapter.parse(payload("execute.after", "bash", { tool_response: "ok" }));
    expect(ctx?.event).toBe("post-bash");
  });

  it("returns null for an ungoverned event", () => {
    expect(opencodeHookAdapter.parse(payload("session.idle", "read"))).toBeNull();
  });

  it("returns null for a malformed payload (fail-open)", () => {
    expect(opencodeHookAdapter.parse("not json")).toBeNull();
    const out = runHook("not json", opencodeHookAdapter);
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("allows an ungoverned tool silently", () => {
    const out = runHook(payload("execute.before", "glob", { tool_input: {} }), opencodeHookAdapter);
    expect(out).toEqual({ stdout: "", exitCode: 0 });
  });

  it("renders advise as a systemMessage", () => {
    const out = opencodeHookAdapter.render(
      { decision: { kind: "advise", message: "careful" } } as Parameters<typeof opencodeHookAdapter.render>[0],
      { event: "pre-edit", cwd: "/tmp/oc" },
    );
    expect(JSON.parse(out.stdout).systemMessage).toBe("careful");
  });
});
