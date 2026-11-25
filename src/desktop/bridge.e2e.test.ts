// E2E (child-process): spawns `gate bridge` against a temp git repo and exercises
// the JSONL protocol for the `review` / `review.decide` methods.
//
// The core invariant proved here (Task 2):
//   After `review` returns a revision, if the working-tree diff changes,
//   calling `review.decide` with the stale revision MUST fail with
//   "A revisão mudou. Abra o diff novamente antes de decidir."
//   The happy path (decide immediately with an unchanged diff) MUST succeed
//   (return null) and append a DESKTOP_REVIEW entry to the run journal.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { openRunJournal } from "../core/engine/run-journal.js";
import { ControlStateMachine } from "../core/control/control-state-machine.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Gate CLI entrypoint compiled to dist/. */
const GATE_CLI = new URL("../../dist/cli/gate.js", import.meta.url).pathname;

/** Wire a `gate bridge` process and return a typed request/reply helper. */
function startBridge(): { proc: ChildProcess; rpc: (method: string, params: Record<string, unknown>) => Promise<{ result?: unknown; error?: string }> } {
  if (!existsSync(GATE_CLI)) {
    throw new Error(`Bridge e2e needs the compiled CLI at ${GATE_CLI}. Run \`npm test\` to build automatically, or \`npm run build\` before running Vitest directly.`);
  }
  const proc = spawn(process.execPath, [GATE_CLI, "bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
    // Isolate the registry so e2e never writes to the real ~/.gatewright/projects.json.
    env: { ...process.env, GATEWRIGHT_PROJECTS: join(registryDir, "projects.json") },
  });

  // Accumulate stdout lines until we match by id.
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

  // If the child dies (e.g. dist/ not built), fail every in-flight request fast
  // instead of hanging until the test timeout.
  const failPending = (why: string) => {
    for (const [id, cb] of pending) { pending.delete(id); cb({ error: why }); }
  };
  proc.on("error", (err) => failPending(`bridge process error: ${err.message}`));
  proc.on("exit", (code) => { if (code) failPending(`bridge process exited with code ${code}`); });

  let nextId = 1;
  const rpc = (method: string, params: Record<string, unknown>) => new Promise<{ result?: unknown; error?: string }>((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    proc.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
  });

  return { proc, rpc };
}

/** Initialise a temporary git repo with one committed file (so HEAD exists). */
function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-e2e-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@gatewright.test");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "initial content\n");
  git("add", "hello.txt");
  git("commit", "-m", "init");
  return dir;
}

/** Seed a run journal with one ENGINE_EVENT so bridge's `review` accepts it. */
function seedJournal(cwd: string, runId: string): void {
  const { journal } = openRunJournal(cwd, runId);
  journal.append({
    type: "ENGINE_EVENT",
    at: new Date().toISOString(),
    payload: { kind: "assistant", text: "hello from engine", model: "test-model" },
  });
}

/** Make a tracked file change that creates a non-empty `git diff HEAD`. */
function makeDiff(cwd: string): void {
  writeFileSync(join(cwd, "hello.txt"), "changed content\n");
}

/** Make an ADDITIONAL change to shift the diff (and hence the revision hash). */
function mutateDiff(cwd: string): void {
  writeFileSync(join(cwd, "hello.txt"), "mutated content — different from review snapshot\n");
}

// ── test state ────────────────────────────────────────────────────────────────

let tmpDir = "";
let registryDir = "";
let bridge: ReturnType<typeof startBridge>;

beforeEach(() => {
  tmpDir = initGitRepo();
  registryDir = mkdtempSync(join(tmpdir(), "bridge-e2e-reg-"));
  bridge = startBridge();
});

afterEach(async () => {
  bridge.proc.stdin!.end();
  await new Promise<void>((resolve) => bridge.proc.on("close", resolve));
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  if (registryDir) rmSync(registryDir, { recursive: true, force: true });
});

// A valid UUID-ish run id that satisfies bridge's regex check.
const RUN_ID = "run-" + "a1b2c3d4-e5f6-7890-abcd-ef1234567890".slice(0, 36);

// ── tests ─────────────────────────────────────────────────────────────────────

// ── additional cases ──────────────────────────────────────────────────────────

describe("bridge — open guards", () => {
  it("open on a file path errors with 'Selecione uma pasta'", async () => {
    // Create a plain file (not a directory) in the temp dir and try to open it.
    const filePath = join(tmpDir, "not-a-dir.txt");
    writeFileSync(filePath, "data");
    const reply = await bridge.rpc("open", { cwd: filePath });
    expect(reply.error).toBeDefined();
    expect(reply.error).toMatch(/Selecione uma pasta/);
  });

  it("open on a valid git repo succeeds and returns {cwd} with realpath", async () => {
    const reply = await bridge.rpc("open", { cwd: tmpDir });
    expect(reply.error).toBeUndefined();
    const result = reply.result as { cwd: string };
    expect(typeof result.cwd).toBe("string");
    // Result should be non-empty and correspond to the temp dir (via realpath).
    expect(result.cwd.length).toBeGreaterThan(0);
    // The returned cwd should end with the same basename we created.
    expect(result.cwd).toMatch(/bridge-e2e-/);
  });
});

describe("bridge — assertProject guard", () => {
  it("snapshot before open errors with 'Abra o projeto'", async () => {
    // We have NOT called open — selected is undefined, so any project-scoped
    // method must reject.
    const reply = await bridge.rpc("snapshot", { cwd: tmpDir });
    expect(reply.error).toBeDefined();
    expect(reply.error).toMatch(/Abra o projeto/);
  });

  it("terminal.preview with wrong cwd (never opened) errors with 'Abra o projeto'", async () => {
    // Open tmpDir so selected is set, then call terminal.preview with a
    // different path — assertProject must reject it.
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const otherDir = mkdtempSync(join(tmpdir(), "bridge-other-"));
    try {
      const reply = await bridge.rpc("terminal.preview", { cwd: otherDir, host: "claude-code" });
      expect(reply.error).toBeDefined();
      expect(reply.error).toMatch(/Abra o projeto/);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});

describe("bridge — terminal.preview: config review without writing (DEF-003)", () => {
  it("preview returns revision + non-empty changes list and writes NO files to disk", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("terminal.preview", { cwd: tmpDir, host: "claude-code" });
    expect(reply.error).toBeUndefined();

    const result = reply.result as { revision: string; changes: Array<{ path: string; action: string; summary: string }> };
    expect(typeof result.revision).toBe("string");
    expect(result.revision.length).toBeGreaterThan(0);
    expect(Array.isArray(result.changes)).toBe(true);
    // For a fresh repo, claude-code plans hooks (.claude/settings.json) and
    // .mcp.json — there must be at least one non-noop change item.
    const actionable = result.changes.filter((c) => c.action !== "noop");
    expect(actionable.length).toBeGreaterThan(0);

    // Critically: NO files must have been written — preview is read-only.
    expect(existsSync(join(tmpDir, ".claude", "settings.json"))).toBe(false);
    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(false);
  });
});

describe("bridge — terminal.apply: writes files + stale-revision guard", () => {
  it("apply with the returned revision writes the expected config files", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const previewReply = await bridge.rpc("terminal.preview", { cwd: tmpDir, host: "claude-code" });
    expect(previewReply.error).toBeUndefined();
    const { revision } = previewReply.result as { revision: string; changes: unknown[] };

    const applyReply = await bridge.rpc("terminal.apply", { cwd: tmpDir, host: "claude-code", revision });
    expect(applyReply.error).toBeUndefined();
    expect(applyReply.result).toBeNull();

    // After apply, at least one of the two target files must now exist.
    const settingsWritten = existsSync(join(tmpDir, ".claude", "settings.json"));
    const mcpWritten = existsSync(join(tmpDir, ".mcp.json"));
    expect(settingsWritten || mcpWritten).toBe(true);
  });

  it("apply with a stale/altered revision errors with 'A configuração mudou'", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    // Obtain a valid revision first (so the host/cwd is correct).
    const previewReply = await bridge.rpc("terminal.preview", { cwd: tmpDir, host: "claude-code" });
    expect(previewReply.error).toBeUndefined();

    // Pass a deliberately wrong/stale revision string.
    const staleRevision = "0".repeat(64);
    const applyReply = await bridge.rpc("terminal.apply", { cwd: tmpDir, host: "claude-code", revision: staleRevision });
    expect(applyReply.error).toBeDefined();
    expect(applyReply.error).toMatch(/A configuração mudou/);
  });
});

describe("bridge — snapshot shape", () => {
  it("snapshot returns expected top-level structure after open", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    const reply = await bridge.rpc("snapshot", { cwd: tmpDir });
    expect(reply.error).toBeUndefined();

    const result = reply.result as {
      usage: unknown;
      linkedProjects: unknown[];
      skills: unknown[];
      providers: unknown[];
      hosts: Array<{ id: string; name: string; installed: boolean; version?: string; hooks: boolean }>;
    };

    // Top-level keys must be present.
    expect(result).toHaveProperty("usage");
    expect(Array.isArray(result.linkedProjects)).toBe(true);
    expect(Array.isArray(result.skills)).toBe(true);
    expect(Array.isArray(result.providers)).toBe(true);
    expect(Array.isArray(result.hosts)).toBe(true);

    // Every host entry must have the required fields.
    for (const host of result.hosts) {
      expect(typeof host.id).toBe("string");
      expect(typeof host.name).toBe("string");
      expect(typeof host.installed).toBe("boolean");
      expect(typeof host.hooks).toBe("boolean");
    }

    // `hooks` reports adapter capability (does Gatewright register hooks for this host),
    // not host-verified protection. Since opencode-hooks shipped the .opencode/plugin/
    // bridge + `gate hook opencode`, opencode now advertises the capability like the others.
    // (Verified-in-host enforcement is a separate, still-pending signal — see CODEX-VALIDATION.md.)
    const opencode = result.hosts.find((h) => h.id === "opencode");
    if (opencode) {
      expect(opencode.hooks).toBe(true);
    }
  });
});

describe("bridge — customize.build: structured recipes without an LLM", () => {
  it("builds and applies link-project (config gains the linked path)", async () => {
    expect((await bridge.rpc("open", { cwd: tmpDir })).error).toBeUndefined();

    const linkTarget = realpathSync(mkdtempSync(join(tmpdir(), "bridge-e2e-link-")));
    try {
      const build = await bridge.rpc("customize.build", { cwd: tmpDir, recipe: { kind: "link-project", path: linkTarget } });
      expect(build.error).toBeUndefined();
      const { revision, change } = build.result as { revision: string; change: { kind: string; path: string } };
      expect(change).toMatchObject({ kind: "link-project", path: linkTarget });
      expect(typeof revision).toBe("string");

      expect((await bridge.rpc("customize.apply", { cwd: tmpDir, revision })).error).toBeUndefined();

      const snap = (await bridge.rpc("snapshot", { cwd: tmpDir })).result as { linkedProjects: string[] };
      expect(snap.linkedProjects).toContain(linkTarget);
    } finally {
      rmSync(linkTarget, { recursive: true, force: true });
    }
  });

  it("builds and applies jev (project integration turns on)", async () => {
    expect((await bridge.rpc("open", { cwd: tmpDir })).error).toBeUndefined();

    const build = await bridge.rpc("customize.build", { cwd: tmpDir, recipe: { kind: "jev", endpoint: "http://127.0.0.1:11434/", model: "qwen" } });
    expect(build.error).toBeUndefined();
    const { revision, change } = build.result as { revision: string; change: { kind: string; model: string } };
    expect(change).toMatchObject({ kind: "jev", model: "qwen" });

    expect((await bridge.rpc("customize.apply", { cwd: tmpDir, revision })).error).toBeUndefined();

    const snap = (await bridge.rpc("snapshot", { cwd: tmpDir })).result as { integrations: { jev: boolean } };
    expect(snap.integrations.jev).toBe(true);
  });

  it("builds graphify with a pinned version and a stable revision (install not exercised here)", async () => {
    expect((await bridge.rpc("open", { cwd: tmpDir })).error).toBeUndefined();

    const recipe = { kind: "graphify", version: "1.2.3" };
    const first = await bridge.rpc("customize.build", { cwd: tmpDir, recipe });
    expect(first.error).toBeUndefined();
    const r1 = first.result as { revision: string; change: unknown; plan: unknown };
    expect(r1.change).toEqual({ kind: "graphify", version: "1.2.3" });
    expect(r1.plan).toBeDefined();

    // Same cwd + recipe ⇒ same revision (the proposals map / apply round-trip relies on this).
    const second = await bridge.rpc("customize.build", { cwd: tmpDir, recipe });
    expect((second.result as { revision: string }).revision).toBe(r1.revision);
  });

  it("rejects a kind outside the structured subset", async () => {
    expect((await bridge.rpc("open", { cwd: tmpDir })).error).toBeUndefined();
    const reply = await bridge.rpc("customize.build", { cwd: tmpDir, recipe: { kind: "mcp-http", name: "x", url: "https://example.com/mcp" } });
    expect(reply.error).toBeDefined();
  });
});

describe("bridge — review / review.decide invariant", () => {
  it("happy path: review.decide with unchanged diff returns null and appends DESKTOP_REVIEW", async () => {
    // Setup: open project, seed journal, create a diff.
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    seedJournal(tmpDir, RUN_ID);
    makeDiff(tmpDir);

    // Call review to obtain a revision.
    const reviewReply = await bridge.rpc("review", { cwd: tmpDir, runId: RUN_ID });
    expect(reviewReply.error).toBeUndefined();
    const { revision } = reviewReply.result as { revision: string; head: string; status: string; diff: string };
    expect(typeof revision).toBe("string");
    expect(revision.length).toBeGreaterThan(0);

    // Decide immediately — diff has not changed, so this must succeed.
    const decideReply = await bridge.rpc("review.decide", { cwd: tmpDir, revision, approved: true });
    expect(decideReply.error).toBeUndefined();
    expect(decideReply.result).toBeNull();

    // Verify that a DESKTOP_REVIEW entry was appended to the journal.
    const { journal } = openRunJournal(tmpDir, RUN_ID);
    const entries = journal.read();
    const reviewEntry = entries.find((e) => e.type === "DESKTOP_REVIEW");
    expect(reviewEntry).toBeDefined();
    expect((reviewEntry!.payload as { approved: boolean }).approved).toBe(true);
    expect((reviewEntry!.payload as { revision: string }).revision).toBe(revision);
  });

  it("invariant: review.decide with stale revision (diff mutated after review) returns error", async () => {
    // Setup: open project, seed journal, create an initial diff.
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    seedJournal(tmpDir, RUN_ID);
    makeDiff(tmpDir);

    // Obtain a revision snapshot.
    const reviewReply = await bridge.rpc("review", { cwd: tmpDir, runId: RUN_ID });
    expect(reviewReply.error).toBeUndefined();
    const { revision } = reviewReply.result as { revision: string };

    // Mutate the working tree so the diff — and therefore the revision — changes.
    mutateDiff(tmpDir);

    // Decide with the now-stale revision: MUST fail with the expiry message.
    const decideReply = await bridge.rpc("review.decide", { cwd: tmpDir, revision, approved: true });
    expect(decideReply.error).toBeDefined();
    expect(decideReply.error).toMatch(/A revisão mudou/);
  });

  it("invariant: review.decide with an entirely unknown revision returns error", async () => {
    const openReply = await bridge.rpc("open", { cwd: tmpDir });
    expect(openReply.error).toBeUndefined();

    seedJournal(tmpDir, RUN_ID);
    makeDiff(tmpDir);

    // Skip calling review — use a bogus revision directly.
    const decideReply = await bridge.rpc("review.decide", { cwd: tmpDir, revision: "deadbeef".repeat(8), approved: true });
    expect(decideReply.error).toBeDefined();
    expect(decideReply.error).toMatch(/A revisão mudou/);
  });
});

describe("bridge — pending action center", () => {
  it("opens the selected run, records its review, and removes the resolved item", async () => {
    const runId = "run-12345678-1234-4234-9234-123456789abc";
    seedJournal(tmpDir, runId);
    const journal = openRunJournal(tmpDir, runId).journal;
    const control = new ControlStateMachine(journal);
    control.transition("RUNNING");
    control.transition("PASSED");
    await bridge.rpc("open", { cwd: tmpDir });
    const first = await bridge.rpc("pending.list", { cwd: tmpDir });
    const items = first.result as Array<{ kind: string; entity: string; revision: string }>;
    expect(items).toHaveLength(1);
    const selected = items[0]!;
    const opened = await bridge.rpc("pending.open", { cwd: tmpDir, ...selected });
    expect(opened.error).toBeUndefined();
    const detail = opened.result as { kind: string; runId: string; review: { revision: string } };
    expect(detail.runId).toBe(runId);
    const decision = await bridge.rpc("review.decide", { cwd: tmpDir, revision: detail.review.revision, approved: true });
    expect(decision.error).toBeUndefined();
    expect((await bridge.rpc("pending.list", { cwd: tmpDir })).result).toEqual([]);
    expect((await bridge.rpc("pending.open", { cwd: tmpDir, ...selected })).error).toContain("pendência mudou");
  });

  it("revalidates a pending item before opening it", async () => {
    const runId = "run-12345678-1234-4234-9234-123456789abc";
    seedJournal(tmpDir, runId);
    const journal = openRunJournal(tmpDir, runId).journal;
    const control = new ControlStateMachine(journal);
    control.transition("RUNNING");
    control.transition("PASSED");
    await bridge.rpc("open", { cwd: tmpDir });
    const items = (await bridge.rpc("pending.list", { cwd: tmpDir })).result as Array<Record<string, unknown>>;
    journal.append({ type: "NOTE", at: new Date().toISOString(), payload: { changed: true } });
    const result = await bridge.rpc("pending.open", { cwd: tmpDir, ...items[0] });
    expect(result.error).toContain("pendência mudou");
  });
});
