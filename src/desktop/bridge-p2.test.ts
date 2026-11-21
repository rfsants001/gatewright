// E2E (child-process): exercises P2 bridge additions — operation tracking,
// revision lock, and integration.test health recording.
//
// All tests follow the same child-process harness used in bridge.e2e.test.ts:
// spawn `gate bridge`, exchange JSONL, assert on results.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// ── constants ─────────────────────────────────────────────────────────────────

const GATE_CLI = new URL("../../dist/cli/gate.js", import.meta.url).pathname;

// ── harness ───────────────────────────────────────────────────────────────────

type RpcReply = { result?: unknown; error?: string };

function startBridge(): {
  proc: ChildProcess;
  rpc: (method: string, params: Record<string, unknown>) => Promise<RpcReply>;
} {
  if (!existsSync(GATE_CLI)) {
    throw new Error(
      `Bridge P2 test needs compiled CLI at ${GATE_CLI}. Run \`npm run build\` first.`,
    );
  }
  const proc = spawn(process.execPath, [GATE_CLI, "bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, (r: RpcReply) => void>();
  let buf = "";
  proc.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { continue; }
      const obj = parsed as Record<string, unknown>;
      if (typeof obj["id"] === "number") {
        const cb = pending.get(obj["id"] as number);
        if (cb) {
          pending.delete(obj["id"] as number);
          const reply: RpcReply = { result: obj["result"] };
          if (typeof obj["error"] === "string") reply.error = obj["error"];
          cb(reply);
        }
      }
    }
  });

  const failPending = (why: string) => {
    for (const [id, cb] of pending) { pending.delete(id); cb({ error: why }); }
  };
  proc.on("error", (err) => failPending(`bridge process error: ${err.message}`));
  proc.on("exit", (code) => { if (code) failPending(`bridge exited with code ${code}`); });

  let nextId = 1;
  const rpc = (method: string, params: Record<string, unknown>) =>
    new Promise<RpcReply>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
    });

  return { proc, rpc };
}

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-p2-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@gatewright.test");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "initial\n");
  git("add", "hello.txt");
  git("commit", "-m", "init");
  return dir;
}

/** Write a managed HTTP MCP entry directly into the project config file.
 *  Config shape mirrors registerManagedMcp: modules[]{id:"mcp-<name>", kind:"mcp", ...}
 */
function seedMcpHttpConfig(cwd: string, name: string, url: string): void {
  const configDir = join(cwd, ".gatewright");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "config.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      modules: [{
        id: `mcp-${name}`,
        kind: "mcp",
        provider: "external",
        enabled: true,
        config: { type: "http", url },
      }],
    }, null, 2) + "\n",
    "utf8",
  );
}

// ── test state ────────────────────────────────────────────────────────────────

let tmpDir = "";
let bridge: ReturnType<typeof startBridge>;

beforeEach(() => {
  tmpDir = initGitRepo();
  bridge = startBridge();
});

afterEach(async () => {
  bridge.proc.stdin!.end();
  await new Promise<void>((resolve) => bridge.proc.on("close", resolve));
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

// ── P2-002: revision lock ─────────────────────────────────────────────────────

describe("bridge — customize.apply revision lock (P2-002)", () => {
  it("apply with unknown revision returns 'A proposta expirou' (not in-flight lock)", async () => {
    // Verifies the guard order: expired-proposal check fires before the lock,
    // and the lock message is NOT returned when no revision is in flight.
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("customize.apply", { cwd: tmpDir, revision: "dead".repeat(16) });
    expect(reply.error).toBeDefined();
    expect(reply.error).toMatch(/A proposta expirou/);
    // Lock error must NOT fire when nothing is in-flight.
    expect(reply.error).not.toMatch(/Esta proposta já está sendo aplicada/);
  });
});

// ── P2-003: integration.test health recording ─────────────────────────────────

describe("bridge — integration.test returns merged HealthStatus (P2-003)", () => {
  it("failed diagnostic records health and returns HealthStatus + DiagnosticFailure fields", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    // Register an HTTP MCP pointing at a non-existent local port so the
    // diagnostic fails (transport error) without needing a real server.
    seedMcpHttpConfig(tmpDir, "test-mcp", "http://127.0.0.1:19999/mcp");

    const reply = await bridge.rpc("integration.test", { cwd: tmpDir, name: "test-mcp" });
    // Bridge must NOT throw — health is recorded and the merged result returned.
    expect(reply.error).toBeUndefined();

    const result = reply.result as Record<string, unknown>;

    // HealthStatus fields.
    expect(result["configured"]).toBe(true);
    expect(typeof result["artifactReady"]).toBe("boolean");
    expect(result["verification"]).toBe("failed");
    expect(Array.isArray(result["actions"])).toBe(true);
    const actions = result["actions"] as string[];
    expect(actions).toContain("retry");

    // DiagnosticFailure fields.
    expect(typeof result["errorCode"]).toBe("string");
    expect(typeof result["message"]).toBe("string");
  });

  it("integration.test for 'gatewright' returns plain DiagnosticResult without HealthStatus", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    // Self-test may time out or succeed; either way bridge must not throw.
    const reply = await bridge.rpc("integration.test", { cwd: tmpDir, name: "gatewright" });
    expect(reply.error).toBeUndefined();

    const result = reply.result as Record<string, unknown>;
    // HealthStatus-specific keys must be absent for the self-test path.
    expect(result["configured"]).toBeUndefined();
    expect(result["artifactReady"]).toBeUndefined();
    expect(result["verification"]).toBeUndefined();
  });

  it("integration.test for unregistered name errors with 'não está registrado'", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("integration.test", { cwd: tmpDir, name: "ghost-mcp" });
    expect(reply.error).toBeDefined();
    expect(reply.error).toMatch(/não está registrado/);
  });
});

// ── P2-004: integration.operation.get + snapshot.operations ──────────────────

describe("bridge — integration.operation.get (P2-004)", () => {
  it("unknown operationId returns null without error", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("integration.operation.get", {
      cwd: tmpDir,
      operationId: "00000000-0000-0000-0000-000000000000",
    });
    expect(reply.error).toBeUndefined();
    expect(reply.result).toBeNull();
  });
});

describe("bridge — snapshot includes operations field (P2-004)", () => {
  it("snapshot.operations is a present empty array for a fresh project", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const snap = await bridge.rpc("snapshot", { cwd: tmpDir });
    expect(snap.error).toBeUndefined();

    const result = snap.result as Record<string, unknown>;
    expect(Object.hasOwn(result, "operations")).toBe(true);
    expect(Array.isArray(result["operations"])).toBe(true);
    expect((result["operations"] as unknown[]).length).toBe(0);
  });
});
