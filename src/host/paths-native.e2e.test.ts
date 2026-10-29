// R0.5-002 — E2e tests for native tool paths.
// Each test sends a realistic Claude Code hook payload through runHook and
// asserts the decision declared in docs/governance-coverage.md.
//
// Paths covered: pre-read (rows 1-2), pre-edit (rows 3-5), pre-bash (rows 6-7),
// post-bash (row 8), post-edit (row 9).

import { describe, expect, it } from "vitest";
import { runHook } from "./run-hook.js";

function silentAllow(out: { stdout: string; exitCode: number }): boolean {
  return out.stdout === "" && out.exitCode === 0;
}

// ---------------------------------------------------------------------------
// pre-read (rows 1–2): secret-guard acts
// ---------------------------------------------------------------------------

describe("e2e: pre-read — native Read / read_file", () => {
  it("Read of .env → deny (secret-guard, OWASP A02)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: ".env" },
        session_id: "e2e-pre-read-1",
        cwd: "/workspace",
      }),
    );
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/secret-guard/i);
  });

  it("Read of .env.local → deny", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/home/user/project/.env.local" },
        session_id: "e2e-pre-read-2",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Read of .env.example → allow (template variant is not a secret)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: ".env.example" },
        session_id: "e2e-pre-read-3",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("read_file (MCP-style native alias) of .env → deny", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "read_file",
        tool_input: { file_path: ".env" },
        session_id: "e2e-pre-read-4",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Read of a normal source file → allow (silent)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "src/app.ts" },
        session_id: "e2e-pre-read-5",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Read of id_rsa → deny (SSH private key)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/home/user/.ssh/id_rsa" },
        session_id: "e2e-pre-read-6",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});

// ---------------------------------------------------------------------------
// pre-edit (rows 3–5): no gate in defaultRegistry → always allow
// ---------------------------------------------------------------------------

describe("e2e: pre-edit — Edit / Write / MultiEdit", () => {
  for (const tool of ["Edit", "Write", "MultiEdit"]) {
    it(`${tool} PreToolUse → allow (no gate in defaultRegistry acts on pre-edit)`, () => {
      const out = runHook(
        JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: tool,
          tool_input: { file_path: "src/foo.ts", content: "export const x = 1;" },
          session_id: `e2e-pre-edit-${tool}`,
          cwd: "/workspace",
        }),
      );
      expect(silentAllow(out)).toBe(true);
    });
  }

  it("Edit PreToolUse of .env → allow (plan-gate not in defaultRegistry; write to secret is legitimate)", () => {
    // Writing/creating a secret file is never blocked by secret-guard.
    // plan-gate (which could block out-of-scope edits) is not in defaultRegistry.
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: ".env", content: "API_KEY=test" },
        session_id: "e2e-pre-edit-secret",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pre-bash (rows 6–7): secret-guard acts
// ---------------------------------------------------------------------------

describe("e2e: pre-bash — Bash / run_in_terminal", () => {
  it("Bash `cat .env` → deny (secret-guard)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "cat .env" },
        session_id: "e2e-pre-bash-1",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Bash `base64 ~/.ssh/id_rsa` → deny", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "base64 ~/.ssh/id_rsa" },
        session_id: "e2e-pre-bash-2",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("run_in_terminal `cat .env` → deny", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "run_in_terminal",
        tool_input: { command: "cat .env" },
        session_id: "e2e-pre-bash-3",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { hookSpecificOutput: { permissionDecision: string } };
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("Bash `npm test` → allow (ordinary command)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        session_id: "e2e-pre-bash-4",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Bash `ls | grep .env` → allow (existence check, not a read)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "ls | grep .env" },
        session_id: "e2e-pre-bash-5",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// post-bash (row 8): error-classifier acts
// ---------------------------------------------------------------------------

describe("e2e: post-bash — Bash PostToolUse", () => {
  it("Bash with ENOENT stderr → advise (error-classifier)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_response: { stdout: "", stderr: "ENOENT: no such file or directory '/tmp/missing'" },
        session_id: "e2e-post-bash-1",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { systemMessage: string };
    expect(parsed.systemMessage).toMatch(/error-classifier/i);
    expect(parsed.systemMessage).toMatch(/path/i); // "check the path"
  });

  it("Bash with TypeScript error stderr → advise (error-classifier)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_response: { stdout: "", stderr: "error TS2345: Argument of type 'string' is not assignable" },
        session_id: "e2e-post-bash-2",
        cwd: "/workspace",
      }),
    );
    const parsed = JSON.parse(out.stdout) as { systemMessage: string };
    expect(parsed.systemMessage).toMatch(/error-classifier/i);
  });

  it("Bash with clean output and no stderr → allow (silent)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_response: { stdout: "build successful", stderr: "" },
        session_id: "e2e-post-bash-3",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Bash with no tool_response → allow (nothing to classify)", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        session_id: "e2e-post-bash-4",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// post-edit (row 9): verify-on-edit acts (advisory)
// ---------------------------------------------------------------------------

describe("e2e: post-edit — Edit PostToolUse", () => {
  it("Edit PostToolUse with a non-existent file → allow (verify-on-edit skips missing files)", () => {
    // verify-on-edit calls existsSync; if the file is gone it returns allow.
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "/tmp/does-not-exist-gw-native-e2e.ts" },
        session_id: "e2e-post-edit-1",
        cwd: "/workspace",
      }),
    );
    expect(silentAllow(out)).toBe(true);
  });

  it("Write PostToolUse maps to post-edit", () => {
    const out = runHook(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/tmp/does-not-exist-gw-native-e2e-write.ts" },
        session_id: "e2e-post-edit-2",
        cwd: "/workspace",
      }),
    );
    // File doesn't exist → allow.
    expect(silentAllow(out)).toBe(true);
  });
});
