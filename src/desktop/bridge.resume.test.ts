// Integration test for durable Flow resume (task FDR-006).
//
// All four cases seed journals directly on disk — no real agent/network.
// The harness extends bridge.e2e.test.ts's child-process pattern with
// an event collector + waitForEvent helper, because the resume feature
// emits lines with an `event` field (no `id`) that the rpc resolver ignores.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { openRunJournal } from "../core/engine/run-journal.js";
import {
  openFlowJournal,
  appendStart,
  appendRun,
  appendTerminal,
} from "../core/flow/flow-journal.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";

// ── constants ─────────────────────────────────────────────────────────────────

const GATE_CLI = new URL("../../dist/cli/gate.js", import.meta.url).pathname;

// A run id that satisfies bridge's regex check (`run-<uuid-ish>`).
const RUN_ID = "run-" + "a1b2c3d4-e5f6-7890-abcd-ef1234567890".slice(0, 36);

// The first step of buildSddFlow() after filtering confirm-ship / ship.
// Computed once at module level so assertions match.
const FILTERED_STEPS = buildSddFlow().filter(
  (s) => s.id !== "confirm-ship" && s.id !== "ship",
);
const FIRST_RUN_STEP_ID = FILTERED_STEPS.find((s) => s.kind === "run")!.id; // "plan"

// A valid <gate-ask> block with one "text" question (id = "clarify").
// The bridge parses this out of the seeded FLOW_RUN output to reconstruct
// the pending ask on replay.
const GATE_ASK_QUESTION_ID = "clarify";
const GATE_ASK_OUTPUT =
  `Here is my analysis.\n\n` +
  `<gate-ask>\n` +
  `[{"id":"${GATE_ASK_QUESTION_ID}","type":"text","prompt":"What is the target environment?"}]\n` +
  `</gate-ask>`;

// ── extended harness ──────────────────────────────────────────────────────────

interface BridgeEvent {
  event: string;
  cwd?: string;
  data: unknown;
}

interface BridgeHandle {
  proc: ChildProcess;
  rpc: (
    method: string,
    params: Record<string, unknown>,
  ) => Promise<{ result?: unknown; error?: string }>;
  /** All event lines received so far (no id field). */
  events: BridgeEvent[];
  /**
   * Resolve with the first matching event or reject after timeoutMs.
   * Checks events already collected before waiting for new ones.
   */
  waitForEvent: (name: string, timeoutMs?: number) => Promise<BridgeEvent>;
}

function startBridge(): BridgeHandle {
  if (!existsSync(GATE_CLI)) {
    throw new Error(
      `Bridge resume test needs compiled CLI at ${GATE_CLI}. Run \`npm run build\` first.`,
    );
  }

  const proc = spawn(process.execPath, [GATE_CLI, "bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // ── rpc bookkeeping ──
  const pending = new Map<
    number,
    (line: { result?: unknown; error?: string }) => void
  >();

  // ── event bookkeeping ──
  const events: BridgeEvent[] = [];
  // Listeners waiting for a specific event name: map from name → resolve fn.
  const eventWaiters = new Map<string, Array<(e: BridgeEvent) => void>>();

  function dispatchEvent(evt: BridgeEvent): void {
    events.push(evt);
    const waiters = eventWaiters.get(evt.event) ?? [];
    if (waiters.length > 0) {
      // Wake all waiters for this event name (each call to waitForEvent
      // registers once; multiple concurrent waits are fine).
      eventWaiters.delete(evt.event);
      for (const resolve of waiters) resolve(evt);
    }
  }

  let buf = "";
  proc.stdout!.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const obj = parsed as Record<string, unknown>;
      if (typeof obj["id"] === "number") {
        // RPC reply
        const cb = pending.get(obj["id"] as number);
        if (cb) {
          pending.delete(obj["id"] as number);
          const reply: { result?: unknown; error?: string } = {
            result: obj["result"],
          };
          if (typeof obj["error"] === "string") reply.error = obj["error"];
          cb(reply);
        }
      } else if (typeof obj["event"] === "string") {
        // Server-push event
        dispatchEvent({
          event: obj["event"] as string,
          ...(typeof obj["cwd"] === "string" ? { cwd: obj["cwd"] } : {}),
          data: obj["data"],
        });
      }
    }
  });

  const failPending = (why: string) => {
    for (const [id, cb] of pending) {
      pending.delete(id);
      cb({ error: why });
    }
  };
  proc.on("error", (err) =>
    failPending(`bridge process error: ${err.message}`),
  );
  proc.on("exit", (code) => {
    if (code) failPending(`bridge process exited with code ${code}`);
  });

  let nextId = 1;
  const rpc = (method: string, params: Record<string, unknown>) =>
    new Promise<{ result?: unknown; error?: string }>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
    });

  const waitForEvent = (name: string, timeoutMs = 5000): Promise<BridgeEvent> =>
    new Promise<BridgeEvent>((resolve, reject) => {
      // Check already-collected events first.
      const existing = events.find((e) => e.event === name);
      if (existing) {
        resolve(existing);
        return;
      }
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for event "${name}" (${timeoutMs}ms)`)),
        timeoutMs,
      );
      const resolveAndClear = (evt: BridgeEvent) => {
        clearTimeout(timer);
        resolve(evt);
      };
      const list = eventWaiters.get(name) ?? [];
      list.push(resolveAndClear);
      eventWaiters.set(name, list);
    });

  return { proc, rpc, events, waitForEvent };
}

// ── git + journal helpers ──────────────────────────────────────────────────────

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "bridge-resume-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@gatewright.test");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "initial content\n");
  git("add", "hello.txt");
  git("commit", "-m", "init");
  return dir;
}

/** Seed a run-journal with a single ENGINE_EVENT so bridge's review() accepts it. */
function seedRunJournal(cwd: string, runId: string): void {
  const { journal } = openRunJournal(cwd, runId);
  journal.append({
    type: "ENGINE_EVENT",
    at: new Date().toISOString(),
    payload: { kind: "assistant", text: "hello from engine", model: "test-model" },
  });
}

// ── test state ────────────────────────────────────────────────────────────────

let tmpDir = "";
let bridge: BridgeHandle;

beforeEach(() => {
  tmpDir = initGitRepo();
  bridge = startBridge();
});

afterEach(async () => {
  bridge.proc.stdin!.end();
  await new Promise<void>((resolve) => bridge.proc.on("close", resolve));
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("bridge — flow resume (FDR-006)", () => {
  // ── Case 1: ASK survives ─────────────────────────────────────────────────────
  it(
    "ASK SURVIVES: open reply carries ask payload (no flow.ask event); flow.answer accepts it",
    async () => {
      // Seed the run journal so review() can read a revision hash.
      seedRunJournal(tmpDir, RUN_ID);

      // Seed the flow journal:
      //   FLOW_START → FLOW_RUN(plan) with gate-ask output
      // After replay the engine will be at plan:ask (an injected ask step).
      const flowJournal = openFlowJournal(tmpDir);
      appendStart(flowJournal, {
        goal: "build a widget",
        flowKind: "sdd",
        engineId: "claude-code",
      });
      appendRun(flowJournal, {
        stepId: FIRST_RUN_STEP_ID, // "plan"
        output: GATE_ASK_OUTPUT,
        runId: RUN_ID,
      });

      // Open the project.
      const openReply = await bridge.rpc("open", { cwd: tmpDir });
      expect(openReply.error).toBeUndefined();

      const result = openReply.result as {
        cwd: string;
        resumableFlow?: {
          title: string;
          atKind: string;
          pendingAsk?: boolean;
          ask?: { token: string; title: string; questions: Array<{ id: string }>; output: string; diff: string };
        };
      };

      // P3-002: open() must report atKind === "ask" with pendingAsk === true AND the full ask payload.
      expect(result.resumableFlow).toBeDefined();
      expect(result.resumableFlow!.atKind).toBe("ask");
      expect(result.resumableFlow!.pendingAsk).toBe(true);
      expect(result.resumableFlow!.ask).toBeDefined();
      const ask = result.resumableFlow!.ask!;
      expect(typeof ask.token).toBe("string");
      expect(ask.token.length).toBeGreaterThan(0);

      // The questions must include the one we seeded — delivered in the reply, not an event.
      const questionIds = ask.questions.map((q) => q.id);
      expect(questionIds).toContain(GATE_ASK_QUESTION_ID);

      // P3-002: NO flow.ask event must be emitted during open (the race is gone).
      // Wait a brief moment then confirm the events list has no flow.ask.
      await new Promise<void>((r) => setTimeout(r, 300));
      const askEvents = bridge.events.filter((e) => e.event === "flow.ask");
      expect(askEvents).toHaveLength(0);

      // Answer the ask using the token from the reply — the engine must accept it (no error).
      const answerReply = await bridge.rpc("flow.answer", {
        cwd: tmpDir,
        token: ask.token,
        answers: { [GATE_ASK_QUESTION_ID]: "staging" },
      });
      // The key assertion: no error means the :ask/:redo were reconstructed by replay.
      expect(answerReply.error).toBeUndefined();
    },
    15000,
  );

  // ── Case 2: RUN AT END → no auto-exec; flow.resume triggers it ───────────────
  it(
    "RUN AT END: open does not auto-start run; flow.resume emits flow.run",
    async () => {
      // Seed ONLY the FLOW_START (no FLOW_RUN entries).
      // After replay the engine is at the first step — a "run" directive.
      const flowJournal = openFlowJournal(tmpDir);
      appendStart(flowJournal, {
        goal: "build a widget",
        flowKind: "sdd",
        engineId: "claude-code",
      });

      const openReply = await bridge.rpc("open", { cwd: tmpDir });
      expect(openReply.error).toBeUndefined();

      const result = openReply.result as {
        cwd: string;
        resumableFlow?: { title: string; atKind: string };
      };

      // open() must report atKind === "run" (paused at a run step).
      expect(result.resumableFlow).toBeDefined();
      expect(result.resumableFlow!.atKind).toBe("run");

      // No flow.ask event must have been emitted (it's a run step, not ask).
      // Wait a brief moment then confirm the events list is empty for flow.ask.
      await new Promise<void>((r) => setTimeout(r, 300));
      const askEvents = bridge.events.filter((e) => e.event === "flow.ask");
      expect(askEvents).toHaveLength(0);

      // No flow.run event yet either (auto-exec is prohibited).
      const runEventsBefore = bridge.events.filter((e) => e.event === "flow.run");
      expect(runEventsBefore).toHaveLength(0);

      // Now call flow.resume — this must trigger the run and emit flow.run.
      // We don't wait for the run to complete (that would need a real agent),
      // just assert that flow.resume returns without error and that a flow.run
      // event is emitted (which is the proof execution started).
      const resumePromise = bridge.rpc("flow.resume", { cwd: tmpDir });
      const flowRunEvent = await bridge.waitForEvent("flow.run", 8000);
      expect(typeof flowRunEvent.data).toBe("string"); // the runId

      const resumeReply = await resumePromise;
      expect(resumeReply.error).toBeUndefined();
    },
    15000,
  );

  // ── Case 3: TERMINAL → no resume ─────────────────────────────────────────────
  it(
    "TERMINAL: open with terminal entry returns no resumableFlow and no flow.ask",
    async () => {
      seedRunJournal(tmpDir, RUN_ID);

      const flowJournal = openFlowJournal(tmpDir);
      appendStart(flowJournal, {
        goal: "build a widget",
        flowKind: "sdd",
        engineId: "claude-code",
      });
      appendRun(flowJournal, {
        stepId: FIRST_RUN_STEP_ID,
        output: GATE_ASK_OUTPUT,
        runId: RUN_ID,
      });
      appendTerminal(flowJournal, "done");

      const openReply = await bridge.rpc("open", { cwd: tmpDir });
      expect(openReply.error).toBeUndefined();

      const result = openReply.result as {
        cwd: string;
        resumableFlow?: unknown;
      };

      // No resumable flow because the journal segment has a terminal entry.
      expect(result.resumableFlow).toBeUndefined();

      // No flow.ask event either.
      await new Promise<void>((r) => setTimeout(r, 300));
      const askEvents = bridge.events.filter((e) => e.event === "flow.ask");
      expect(askEvents).toHaveLength(0);
    },
    10000,
  );

  // ── Case 4: DRIFT → no resume, bridge stays responsive ───────────────────────
  it(
    "DRIFT: unknown stepId causes no resume and bridge stays responsive",
    async () => {
      seedRunJournal(tmpDir, RUN_ID);

      const flowJournal = openFlowJournal(tmpDir);
      appendStart(flowJournal, {
        goal: "build a widget",
        flowKind: "sdd",
        engineId: "claude-code",
      });
      // A stepId that does not exist in the filtered SDD flow → replayFlow returns drift.
      appendRun(flowJournal, {
        stepId: "nonexistent-step-id",
        output: "some output",
        runId: RUN_ID,
      });

      const openReply = await bridge.rpc("open", { cwd: tmpDir });
      expect(openReply.error).toBeUndefined();

      const result = openReply.result as {
        cwd: string;
        resumableFlow?: unknown;
      };

      // Drift path: bridge calls appendTerminal("version-mismatch") and does
      // not set flow, so resumableFlow must be absent.
      expect(result.resumableFlow).toBeUndefined();

      // The bridge must still be responsive — a snapshot call must succeed.
      const snapshotReply = await bridge.rpc("snapshot", { cwd: tmpDir });
      expect(snapshotReply.error).toBeUndefined();
      expect(snapshotReply.result).toBeDefined();
    },
    10000,
  );
});
