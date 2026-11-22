// E2E (child-process): exercises `projects` + `projects.remove` through the
// bridge JSONL protocol. Harness mirrors bridge.skills-agents.test.ts —
// compiled subprocess, temp git repos, GATEWRIGHT_PROJECTS not set (open()
// registers each project in the subprocess's in-process registry).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const GATE_CLI = new URL("../../dist/cli/gate.js", import.meta.url).pathname;

function startBridge(projectsFile: string): {
  proc: ChildProcess;
  rpc: (method: string, params: Record<string, unknown>) => Promise<{ result?: unknown; error?: string }>;
} {
  if (!existsSync(GATE_CLI)) {
    throw new Error(`Bridge projects test needs compiled CLI at ${GATE_CLI}. Run \`npm run build\` first.`);
  }
  // Isolate the registry to a temp file so the test is deterministic and never
  // touches the developer's real ~/.gatewright/projects.json.
  const proc = spawn(process.execPath, [GATE_CLI, "bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, GATEWRIGHT_PROJECTS: projectsFile },
  });

  const pending = new Map<number, (line: { result?: unknown; error?: string }) => void>();
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
          const reply: { result?: unknown; error?: string } = { result: obj["result"] };
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
  proc.on("exit", (code) => { if (code) failPending(`bridge process exited with code ${code}`); });

  let nextId = 1;
  const rpc = (method: string, params: Record<string, unknown>) =>
    new Promise<{ result?: unknown; error?: string }>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
    });

  return { proc, rpc };
}

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-projects-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@gatewright.test");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "initial\n");
  git("add", "hello.txt");
  git("commit", "-m", "init");
  return dir;
}

type Entry = { path: string; name: string };
const listPaths = (reply: { result?: unknown }) => (reply.result as Entry[]).map((p) => p.path);
/** Resolve the registered path for a repo via its folder name (open() may realpath the cwd). */
const registeredPath = (entries: Entry[], repo: string) =>
  entries.find((p) => basename(p.path) === basename(repo))?.path;

let repoA = "";
let repoB = "";
let registryDir = "";
let bridge: ReturnType<typeof startBridge>;

beforeEach(() => {
  repoA = initGitRepo();
  repoB = initGitRepo();
  registryDir = mkdtempSync(join(tmpdir(), "bridge-projects-reg-"));
  bridge = startBridge(join(registryDir, "projects.json"));
});

afterEach(async () => {
  bridge.proc.stdin!.end();
  await new Promise<void>((resolve) => bridge.proc.on("close", resolve));
  for (const dir of [repoA, repoB, registryDir]) if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("bridge — projects.remove", () => {
  it("forgets one project, leaves the others and the folder on disk", async () => {
    await bridge.rpc("open", { cwd: repoA });
    await bridge.rpc("open", { cwd: repoB });

    const before = await bridge.rpc("projects", {});
    const beforeEntries = before.result as Entry[];
    const pathA = registeredPath(beforeEntries, repoA);
    const pathB = registeredPath(beforeEntries, repoB);
    expect(pathA).toBeDefined();
    expect(pathB).toBeDefined();

    const removed = await bridge.rpc("projects.remove", { path: pathA! });
    expect(removed.error).toBeUndefined();

    const after = listPaths(removed);
    expect(after).not.toContain(pathA);
    expect(after).toContain(pathB);
    // removal only forgets the registry entry — the folder stays on disk.
    expect(existsSync(repoA)).toBe(true);
  });

  it("is a no-op for an unknown path (still returns the current list)", async () => {
    await bridge.rpc("open", { cwd: repoA });
    const reply = await bridge.rpc("projects.remove", { path: "/does/not/exist" });
    expect(reply.error).toBeUndefined();
    expect((reply.result as Entry[]).length).toBe(1);
  });

  it("rejects a request without a string path", async () => {
    const reply = await bridge.rpc("projects.remove", {});
    expect(reply.error).toBeDefined();
  });
});
