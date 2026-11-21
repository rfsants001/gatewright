// E2E (child-process): exercises agent.update, agent.delete, skills.list, skills.detail
// through the bridge JSONL protocol.
//
// Harness is identical to bridge.e2e.test.ts — compiled subprocess, temp git repo,
// GATEWRIGHT_PROJECTS not set (open() registers the project in the subprocess's
// in-process registry, so no cross-process file is needed).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// ── constants ─────────────────────────────────────────────────────────────────

const GATE_CLI = new URL("../../dist/cli/gate.js", import.meta.url).pathname;

// ── harness ───────────────────────────────────────────────────────────────────

function startBridge(): {
  proc: ChildProcess;
  rpc: (method: string, params: Record<string, unknown>) => Promise<{ result?: unknown; error?: string }>;
} {
  if (!existsSync(GATE_CLI)) {
    throw new Error(`Bridge skills/agents test needs compiled CLI at ${GATE_CLI}. Run \`npm run build\` first.`);
  }
  const proc = spawn(process.execPath, [GATE_CLI, "bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
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
  const dir = mkdtempSync(join(tmpdir(), "bridge-skills-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@gatewright.test");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "initial\n");
  git("add", "hello.txt");
  git("commit", "-m", "init");
  return dir;
}

/** Write a minimal valid SKILL.md into <cwd>/.gatewright/skills/<name>/. */
function seedProjectSkill(cwd: string, name: string, description = "A test skill"): void {
  const skillDir = join(cwd, ".gatewright", "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\ntriggers: []\nskill-kind: general\n---\n\n# ${name}\n\nTest body.\n`,
    "utf8",
  );
}

// A minimal valid agent profile used in both save + update tests.
const BASE_AGENT = {
  id: "test-agent",
  name: "Test Agent",
  goal: "Test the bridge wiring.",
  skills: [] as string[],  // will be filled after seeding skill
};

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

// ── agent.update ──────────────────────────────────────────────────────────────

describe("bridge — agent.update", () => {
  it("persists a name change and is reflected in the next snapshot", async () => {
    seedProjectSkill(tmpDir, "my-skill");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    // Save an agent first.
    const agent = { id: "agent-upd", name: "Before", goal: "g", skills: ["my-skill"] };
    const saveReply = await bridge.rpc("agent.save", { cwd: tmpDir, agent });
    expect(saveReply.error).toBeUndefined();

    // Update — change name.
    const updated = { ...agent, name: "After" };
    const updateReply = await bridge.rpc("agent.update", { cwd: tmpDir, agent: updated });
    expect(updateReply.error).toBeUndefined();
    expect(updateReply.result).toBeNull();

    // Verify via snapshot that the name changed.
    const snap = await bridge.rpc("snapshot", { cwd: tmpDir });
    expect(snap.error).toBeUndefined();
    const agents = (snap.result as { agents: Array<{ id: string; name: string }> }).agents;
    const found = agents.find((a) => a.id === "agent-upd");
    expect(found).toBeDefined();
    expect(found!.name).toBe("After");
  });

  it("returns an error when the agent id does not exist", async () => {
    seedProjectSkill(tmpDir, "my-skill");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    // Update an agent that was never saved.
    const reply = await bridge.rpc("agent.update", {
      cwd: tmpDir,
      agent: { id: "ghost", name: "Ghost", goal: "g", skills: ["my-skill"] },
    });
    expect(reply.error).toBeDefined();
    expect(reply.error).toMatch(/não encontrado/i);
  });
});

// ── agent.delete ──────────────────────────────────────────────────────────────

describe("bridge — agent.delete", () => {
  it("removes the agent and it is absent from the next snapshot", async () => {
    seedProjectSkill(tmpDir, "my-skill");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const agent = { id: "agent-del", name: "ToDelete", goal: "g", skills: ["my-skill"] };
    const saveReply = await bridge.rpc("agent.save", { cwd: tmpDir, agent });
    expect(saveReply.error).toBeUndefined();

    const delReply = await bridge.rpc("agent.delete", { cwd: tmpDir, id: "agent-del" });
    expect(delReply.error).toBeUndefined();
    expect(delReply.result).toBeNull();

    const snap = await bridge.rpc("snapshot", { cwd: tmpDir });
    const agents = (snap.result as { agents: Array<{ id: string }> }).agents;
    expect(agents.find((a) => a.id === "agent-del")).toBeUndefined();
  });
});

// ── skills.list ───────────────────────────────────────────────────────────────

describe("bridge — skills.list", () => {
  it("returns a project skill with origin 'project'", async () => {
    seedProjectSkill(tmpDir, "proj-skill", "My project skill");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("skills.list", { cwd: tmpDir });
    expect(reply.error).toBeUndefined();

    const result = reply.result as {
      skills: Array<{ name: string; origin: string }>;
      categories: string[];
      origins: string[];
      problems: unknown[];
    };
    expect(Array.isArray(result.skills)).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
    expect(Array.isArray(result.origins)).toBe(true);

    const proj = result.skills.find((s) => s.name === "proj-skill");
    expect(proj).toBeDefined();
    expect(proj!.origin).toBe("project");
  });

  it("filters by query — matching name surfaces, non-matching name is absent", async () => {
    seedProjectSkill(tmpDir, "alpha-skill", "Alpha thing");
    seedProjectSkill(tmpDir, "beta-skill", "Beta thing");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("skills.list", { cwd: tmpDir, query: "alpha" });
    expect(reply.error).toBeUndefined();

    const result = reply.result as { skills: Array<{ name: string }> };
    const names = result.skills.map((s) => s.name);
    expect(names).toContain("alpha-skill");
    expect(names).not.toContain("beta-skill");
  });
});

// ── skills.detail ─────────────────────────────────────────────────────────────

describe("bridge — skills.detail", () => {
  it("returns body and origin for a known project skill", async () => {
    seedProjectSkill(tmpDir, "detail-skill", "Detail description");

    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("skills.detail", { cwd: tmpDir, name: "detail-skill" });
    expect(reply.error).toBeUndefined();

    const detail = reply.result as { name: string; origin: string; body: string; description: string };
    expect(detail).not.toBeNull();
    expect(detail.name).toBe("detail-skill");
    expect(detail.origin).toBe("project");
    expect(typeof detail.body).toBe("string");
    expect(detail.body.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown skill name", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("skills.detail", { cwd: tmpDir, name: "does-not-exist" });
    expect(reply.error).toBeUndefined();
    expect(reply.result).toBeNull();
  });
});
