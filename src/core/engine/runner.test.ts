import { describe, expect, it } from "vitest";
import { Journal } from "../journal/journal.js";
import type { ArtifactStore } from "../artifact-store/types.js";
import { ENGINE_EVENT_TYPE, type RunJournal } from "./run-journal.js";
import { startRun, type ChildLike, type SpawnFn } from "./runner.js";
import { createClaudeCodeAdapter } from "./adapters/claude-code.js";

class MemoryStore implements ArtifactStore {
  #m = new Map<string, string>();
  write(path: string, data: string | Uint8Array): void {
    this.#m.set(path, typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
  }
  read(path: string): string | null {
    return this.#m.get(path) ?? null;
  }
  exists(path: string): boolean {
    return this.#m.has(path);
  }
  recover(): void {}
}

function memRunJournal(): RunJournal {
  const store = new MemoryStore();
  return { journal: new Journal(store, "/mem/journal.json"), dir: "/mem", path: "/mem/journal.json" };
}

/** A controllable fake child + spawn: push stdout/stderr, then close/error. */
function fakeSpawn(): { spawn: SpawnFn; pushOut: (s: string) => void; pushErr: (s: string) => void; close: (code: number | null) => void; error: (e: Error) => void } {
  const outCbs: ((c: string) => void)[] = [];
  const errCbs: ((c: string) => void)[] = [];
  const closeCbs: ((code: number | null) => void)[] = [];
  const errorCbs: ((e: Error) => void)[] = [];
  const child: ChildLike = {
    stdout: { on: (_e, cb) => outCbs.push(cb) },
    stderr: { on: (_e, cb) => errCbs.push(cb) },
    on(event, cb) {
      if (event === "close") closeCbs.push(cb as (code: number | null) => void);
      else errorCbs.push(cb as (e: Error) => void);
      return this;
    },
    kill: () => true,
  };
  return {
    spawn: () => child,
    pushOut: (s) => outCbs.forEach((cb) => cb(s)),
    pushErr: (s) => errCbs.forEach((cb) => cb(s)),
    close: (code) => closeCbs.forEach((cb) => cb(code)),
    error: (e) => errorCbs.forEach((cb) => cb(e)),
  };
}

const adapter = createClaudeCodeAdapter();
const opts = { prompt: "x", cwd: "/tmp/p", mcpConfigPath: "/tmp/p/.gatewright/gate.mcp.json" };
const line = (o: unknown) => `${JSON.stringify(o)}\n`;

describe("startRun — streaming + logs", () => {
  it("emits one event per stream line and persists each to the journal", async () => {
    const fake = fakeSpawn();
    const rj = memRunJournal();
    const seen: string[] = [];
    const handle = startRun(adapter, opts, { onEvent: (e) => seen.push(e.kind) }, { spawn: fake.spawn, runJournal: rj, now: () => "t" });
    fake.pushOut(line({ type: "system", subtype: "init" }));
    fake.pushOut(line({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }));
    fake.pushOut(line({ type: "result", result: "done" }));
    fake.close(0);
    const result = await handle.done;
    expect(result.exitCode).toBe(0);
    expect(seen).toEqual(["system", "tool_use", "result"]);
    expect(rj.journal.read().filter((e) => e.type === ENGINE_EVENT_TYPE)).toHaveLength(3);
  });

  it("reassembles a line split across chunks", async () => {
    const fake = fakeSpawn();
    const seen: string[] = [];
    const handle = startRun(adapter, opts, { onEvent: (e) => e.text && seen.push(e.text) }, { spawn: fake.spawn, runJournal: memRunJournal() });
    const full = line({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } });
    fake.pushOut(full.slice(0, 10));
    fake.pushOut(full.slice(10));
    fake.close(0);
    await handle.done;
    expect(seen).toEqual(["hello"]);
  });

  it("captures stderr as a persisted error event", async () => {
    const fake = fakeSpawn();
    const rj = memRunJournal();
    const handle = startRun(adapter, opts, {}, { spawn: fake.spawn, runJournal: rj });
    fake.pushErr("boom\n");
    fake.close(1);
    const result = await handle.done;
    expect(result.exitCode).toBe(1);
    const errs = rj.journal.read().map((e) => e.payload as { kind: string; text?: string }).filter((p) => p.kind === "error");
    expect(errs[0]?.text).toBe("boom");
  });

  it("turns a spawn error into an error event and a null exit code", async () => {
    const fake = fakeSpawn();
    const handle = startRun(adapter, opts, {}, { spawn: fake.spawn, runJournal: memRunJournal() });
    fake.error(new Error("ENOENT"));
    const result = await handle.done;
    expect(result.exitCode).toBeNull();
    expect(result.state).toBe("FAILED");
  });
});

describe("startRun — lifecycle", () => {
  it("goes IDLE→RUNNING→PASSED on exit 0", async () => {
    const fake = fakeSpawn();
    const states: string[] = [];
    const handle = startRun(adapter, opts, { onState: (s) => states.push(s) }, { spawn: fake.spawn, runJournal: memRunJournal() });
    fake.close(0);
    const result = await handle.done;
    expect(states).toEqual(["RUNNING", "PASSED"]);
    expect(result.state).toBe("PASSED");
  });

  it("goes RUNNING→FAILED on a non-zero exit", async () => {
    const fake = fakeSpawn();
    const handle = startRun(adapter, opts, {}, { spawn: fake.spawn, runJournal: memRunJournal() });
    fake.close(2);
    expect((await handle.done).state).toBe("FAILED");
  });

  it("ignores a second close (terminal state never rewrites)", async () => {
    const fake = fakeSpawn();
    const rj = memRunJournal();
    const states: string[] = [];
    const handle = startRun(adapter, opts, { onState: (s) => states.push(s) }, { spawn: fake.spawn, runJournal: rj });
    fake.close(0);
    await handle.done;
    fake.close(1); // late/duplicate — must not transition again
    expect(states).toEqual(["RUNNING", "PASSED"]);
  });
});
