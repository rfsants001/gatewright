import { describe, expect, it } from "vitest";
import { codexHookAdapter } from "./codex.js";
import { runHook } from "./run-hook.js";
describe("Codex native hooks", () => {
  it.each(["exec_command", "functions.exec_command", "shell_command"])(
    "governs secret reads through %s",
    (tool_name) => {
      const result = runHook(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name,
          cwd: "/project",
          tool_input: { cmd: "cat .env" },
        }),
        codexHookAdapter,
      );
      expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    },
  );
  it("normalizes shell argv and all patch targets, including renames", () => {
    expect(
      codexHookAdapter.parse(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "shell",
          cwd: "/project",
          session_id: "thread",
          tool_input: { command: ["cat", ".env"] },
        }),
      ),
    ).toMatchObject({ event: "pre-bash", sessionKey: "thread", toolInput: { command: "cat .env" } });
    expect(
      codexHookAdapter.parse(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "apply_patch",
          cwd: "/project",
          tool_input:
            "*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: src/b.ts\n*** Add File: tests/a.ts\n*** End Patch",
        }),
      ),
    ).toMatchObject({
      event: "pre-edit",
      toolInput: { files: [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "tests/a.ts" }] },
    });
  });
});
