import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEngineEvent, ENGINE_EVENT_TYPE, openRunJournal, runJournalPath, sanitizeSlug } from "./run-journal.js";

describe("run-journal", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-run-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("sanitizes unsafe slugs to a single safe segment", () => {
    expect(sanitizeSlug("../../etc/passwd")).not.toContain("/");
    expect(sanitizeSlug("")).toBe("run");
    expect(sanitizeSlug("sess_abc-123")).toBe("sess_abc-123");
  });

  it("places the journal under .gatewright/runs/<slug>", () => {
    expect(runJournalPath(dir, "s1")).toBe(join(dir, ".gatewright", "runs", "s1", "journal.json"));
  });

  it("appends engine events and reads them back, hash-chain intact", () => {
    const { journal } = openRunJournal(dir, "s1");
    appendEngineEvent(journal, { kind: "assistant", text: "hi" }, "2026-01-01T00:00:00Z");
    appendEngineEvent(journal, { kind: "tool_use", tool: "Bash" }, "2026-01-01T00:00:01Z");
    const events = journal.read();
    expect(events.map((e) => e.type)).toEqual([ENGINE_EVENT_TYPE, ENGINE_EVENT_TYPE]);
    expect((events[1]!.payload as { tool: string }).tool).toBe("Bash");
    expect(journal.verify().ok).toBe(true);
  });
});
