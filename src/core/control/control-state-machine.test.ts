import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { ControlStateMachine } from "./control-state-machine.js";
import { canTransition, isTerminal, ControlStateError } from "./control-state.js";

describe("control-state transitions table", () => {
  it("allows only the policy edges", () => {
    expect(canTransition("IDLE", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "PASSED")).toBe(true);
    expect(canTransition("IDLE", "PASSED")).toBe(false);
    expect(canTransition("PASSED", "RUNNING")).toBe(false);
  });

  it("marks terminal states", () => {
    expect(isTerminal("PASSED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("RUNNING")).toBe(false);
    expect(isTerminal("IDLE")).toBe(false);
  });
});

describe("ControlStateMachine", () => {
  let dir: string;
  const store = new FileArtifactStore();
  const make = () => {
    const journal = new Journal(store, join(dir, "log.json"));
    return { journal, machine: new ControlStateMachine(journal) };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-control-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts IDLE with an empty journal", () => {
    expect(make().machine.current()).toBe("IDLE");
  });

  it("walks a full lifecycle and tracks current()", () => {
    const { machine } = make();
    machine.transition("RUNNING");
    machine.transition("PAUSED");
    machine.transition("RUNNING");
    expect(machine.current()).toBe("RUNNING");
    machine.transition("PASSED");
    expect(machine.current()).toBe("PASSED");
  });

  it("rejects an illegal transition and writes no event", () => {
    const { journal, machine } = make();
    machine.transition("RUNNING");
    machine.transition("PASSED");
    const before = journal.read().length;
    expect(() => machine.transition("RUNNING")).toThrow(ControlStateError);
    expect(journal.read().length).toBe(before);
    expect(machine.current()).toBe("PASSED");
  });

  it("keeps the journal chain intact across transitions", () => {
    const { journal, machine } = make();
    machine.transition("RUNNING");
    machine.transition("FAILED");
    expect(journal.verify()).toEqual({ ok: true });
    expect(journal.read()).toHaveLength(2);
  });

  it("derives current() from the journal on a fresh instance (event-sourced)", () => {
    make().machine.transition("RUNNING");
    // new machine over the same journal path → state recovered from events
    expect(make().machine.current()).toBe("RUNNING");
  });
});
