// The headless runner — the heart of the cockpit. It spawns the engine with the
// command the adapter built (which forces the gate's MCP), streams stdout line by
// line into normalized events, persists every event to the run journal (logs are
// the #1 artifact), and surfaces stderr as error events. spawn is injectable so
// tests never touch a real process.

import { spawn as nodeSpawn } from "node:child_process";
import { ControlStateMachine } from "../control/control-state-machine.js";
import { canTransition, type ControlState } from "../control/control-state.js";
import type { RunBindingStore } from "../run-binding/run-binding-store.js";
import type { EngineAdapter, EngineCommand, EngineEvent, EngineRunOptions } from "./types.js";
import { appendEngineEvent, openRunJournal, sanitizeSlug, type RunJournal } from "./run-journal.js";

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

export const defaultSpawn: SpawnFn = (cmd, cwd) =>
  // stdin is closed (ignore) so the engine doesn't wait on an open pipe it'll never
  // get — otherwise `claude -p` warns "no stdin data received in 3s".
  nodeSpawn(cmd.bin, cmd.args, { cwd, env: { ...process.env, ...cmd.env }, stdio: ["ignore", "pipe", "pipe"] });

export interface RunResult {
  exitCode: number | null;
  state: ControlState;
}

export interface RunHandlers {
  onEvent?: (ev: EngineEvent) => void;
  onState?: (state: ControlState) => void;
  onClose?: (result: RunResult) => void;
}

export interface RunDeps {
  spawn?: SpawnFn;
  /** Run slug for the journal path; defaults to the session or "run". */
  slug?: string;
  /** Override the run journal (tests inject an in-memory store). */
  runJournal?: RunJournal;
  now?: () => string;
  /** When both are present, the run is bound to the workspace for crash recovery. */
  runBindingStore?: RunBindingStore;
  sessionKey?: string;
  /** How long to wait after SIGTERM before SIGKILL (default 2000ms). */
  killTimeoutMs?: number;
}

export interface RunHandle {
  done: Promise<RunResult>;
  /** Request cancellation: SIGTERM now, SIGKILL after the grace period; ends CANCELLED. */
  cancel: () => void;
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
  const slug = sanitizeSlug(deps.slug ?? "run");
  const rj = deps.runJournal ?? openRunJournal(opts.cwd, slug);
  const control = new ControlStateMachine(rj.journal);

  const emit = (ev: EngineEvent): void => {
    appendEngineEvent(rj.journal, ev, now());
    handlers.onEvent?.(ev);
  };
  /** Transition only when legal, so an illegal move never writes a control event. */
  const setState = (to: ControlState): void => {
    if (!canTransition(control.current(), to)) return;
    control.transition(to);
    handlers.onState?.(to);
  };

  // Build the command first (a stub engine throws here before we touch the process).
  const cmd = adapter.buildHeadlessCommand(opts);
  if (deps.runBindingStore && deps.sessionKey) {
    deps.runBindingStore.update(opts.cwd, (bindings) => {
      bindings[deps.sessionKey!] = slug;
    });
  }
  setState("RUNNING");
  const child = spawn(cmd, opts.cwd);

  const outSplitter = makeLineSplitter((line) => {
    const ev = adapter.parseStreamLine(line);
    if (ev) emit(ev);
  });
  const errSplitter = makeLineSplitter((line) => emit({ kind: "error", text: line }));
  child.stdout?.on("data", (c) => outSplitter.feed(c));
  child.stderr?.on("data", (c) => errSplitter.feed(c));

  let cancelled = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const done = new Promise<RunResult>((resolve) => {
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      outSplitter.flush();
      errSplitter.flush();
      setState(cancelled ? "CANCELLED" : exitCode === 0 ? "PASSED" : "FAILED");
      const result: RunResult = { exitCode, state: control.current() };
      handlers.onClose?.(result);
      resolve(result);
    };
    child.on("error", (err) => {
      emit({ kind: "error", text: `spawn failed: ${err.message}` });
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });

  const cancel = (): void => {
    if (settled || cancelled) return;
    cancelled = true;
    emit({ kind: "system", text: "cancelling run…" });
    child.kill("SIGTERM");
    killTimer = setTimeout(() => child.kill("SIGKILL"), deps.killTimeoutMs ?? 2000);
    killTimer.unref?.();
  };

  return { done, cancel };
}
