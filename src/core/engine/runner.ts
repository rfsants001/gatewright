// The headless runner — the heart of the cockpit. It spawns the engine with the
// command the adapter built (which forces the gate's MCP), streams stdout line by
// line into normalized events, persists every event to the run journal (logs are
// the #1 artifact), and surfaces stderr as error events. spawn is injectable so
// tests never touch a real process.

import { spawn as nodeSpawn } from "node:child_process";
import type { EngineAdapter, EngineCommand, EngineEvent, EngineRunOptions } from "./types.js";
import { appendEngineEvent, openRunJournal, type RunJournal } from "./run-journal.js";

/** Minimal stream shape we depend on (node Readable satisfies it). */
export interface ReadableLike {
  on(event: "data", cb: (chunk: Buffer | string) => void): unknown;
}

/** Minimal child-process shape we depend on (node ChildProcess satisfies it). */
export interface ChildLike {
  stdout: ReadableLike | null;
  stderr: ReadableLike | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnFn = (cmd: EngineCommand, cwd: string) => ChildLike;

export const defaultSpawn: SpawnFn = (cmd, cwd) => nodeSpawn(cmd.bin, cmd.args, { cwd, env: { ...process.env, ...cmd.env } });

export interface RunResult {
  exitCode: number | null;
}

export interface RunHandlers {
  onEvent?: (ev: EngineEvent) => void;
  onClose?: (result: RunResult) => void;
}

export interface RunDeps {
  spawn?: SpawnFn;
  /** Run slug for the journal path; defaults to the session or "run". */
  slug?: string;
  /** Override the run journal (tests inject an in-memory store). */
  runJournal?: RunJournal;
  now?: () => string;
}

export interface RunHandle {
  done: Promise<RunResult>;
}

/** Split a byte/char stream into lines, feeding each to `onLine`; flush the tail at close. */
function makeLineSplitter(onLine: (line: string) => void): { feed: (chunk: Buffer | string) => void; flush: () => void } {
  let buf = "";
  return {
    feed(chunk) {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    },
    flush() {
      if (buf.length) {
        onLine(buf);
        buf = "";
      }
    },
  };
}

export function startRun(adapter: EngineAdapter, opts: EngineRunOptions, handlers: RunHandlers = {}, deps: RunDeps = {}): RunHandle {
  const spawn = deps.spawn ?? defaultSpawn;
  const now = deps.now ?? (() => new Date().toISOString());
  const rj = deps.runJournal ?? openRunJournal(opts.cwd, deps.slug ?? "run");

  const emit = (ev: EngineEvent): void => {
    appendEngineEvent(rj.journal, ev, now());
    handlers.onEvent?.(ev);
  };

  const cmd = adapter.buildHeadlessCommand(opts);
  const child = spawn(cmd, opts.cwd);

  const outSplitter = makeLineSplitter((line) => {
    const ev = adapter.parseStreamLine(line);
    if (ev) emit(ev);
  });
  const errSplitter = makeLineSplitter((line) => emit({ kind: "error", text: line }));
  child.stdout?.on("data", (c) => outSplitter.feed(c));
  child.stderr?.on("data", (c) => errSplitter.feed(c));

  const done = new Promise<RunResult>((resolve) => {
    let settled = false;
    const finish = (result: RunResult): void => {
      if (settled) return;
      settled = true;
      outSplitter.flush();
      errSplitter.flush();
      handlers.onClose?.(result);
      resolve(result);
    };
    child.on("error", (err) => {
      emit({ kind: "error", text: `spawn failed: ${err.message}` });
      finish({ exitCode: null });
    });
    child.on("close", (code) => finish({ exitCode: code }));
  });

  return { done };
}
