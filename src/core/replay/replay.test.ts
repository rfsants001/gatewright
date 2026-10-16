import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { ControlStateMachine } from "../control/control-state-machine.js";
import { TimeTravel, replay } from "./time-travel.js";
import { controlStateProjection, journalSummaryProjection } from "./projections.js";
import { runReplay } from "./cli.js";

describe("replay / time-travel", () => {
  let dir: string;
  let path: string;
  const store = new FileArtifactStore();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-replay-"));
    path = join(dir, "log.json");
    const fsm = new ControlStateMachine(new Journal(store, path));
    fsm.transition("RUNNING");
    fsm.transition("PAUSED");
    fsm.transition("RUNNING");
    fsm.transition("PASSED");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const tt = () => new TimeTravel(new Journal(store, path));

  it("projects control-state at any bounded point", () => {
    expect(tt().project(controlStateProjection)).toBe("PASSED"); // latest
    expect(tt().project(controlStateProjection, 0)).toBe("RUNNING");
    expect(tt().project(controlStateProjection, 1)).toBe("PAUSED");
  });

  it("bounds the fold and clamps out-of-range indices", () => {
    const events = new Journal(store, path).read();
    expect(replay(events, controlStateProjection, 999)).toBe("PASSED");
    expect(replay(events, controlStateProjection, -1)).toBe("IDLE"); // nothing applied
  });

  it("indexAtTimestamp picks the last event at or before T", () => {
    const events = new Journal(store, path).read();
    const t1 = events[1]!.at;
    expect(tt().indexAtTimestamp(t1)).toBeGreaterThanOrEqual(1);
    expect(tt().indexAtTimestamp("1970-01-01T00:00:00Z")).toBe(-1);
  });

  it("journal-summary counts events and tracks head hash", () => {
    const sum = tt().project(journalSummaryProjection);
    expect(sum.total).toBe(4);
    expect(sum.byType["CONTROL_STATE_CHANGED"]).toBe(4);
    expect(sum.headHash).toBe(new Journal(store, path).head());
  });

  it("is deterministic", () => {
    expect(tt().project(controlStateProjection, 2)).toBe(tt().project(controlStateProjection, 2));
  });

  it("CLI reports state at a chosen event and errors on a missing journal", () => {
    expect(runReplay([path, "--at", "1"]).stdout).toContain("control-state: PAUSED");
    expect(runReplay([path, "--summary"]).stdout).toContain("\"total\": 4");
    expect(runReplay([join(dir, "nope.json")]).exitCode).toBe(1);
    expect(runReplay([]).exitCode).toBe(1);
  });
});
