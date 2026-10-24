import { describe, it, expect } from "vitest";
import { deriveFileChanges } from "./file-changes.js";
import type { EngineEvent } from "../engine/types.js";

describe("deriveFileChanges", () => {
  it("returns empty for no file events", () => {
    const events: EngineEvent[] = [
      { kind: "assistant", text: "hello" },
      { kind: "usage", usage: { tokensIn: 1, tokensOut: 1, cacheRead: 0 } },
    ];
    expect(deriveFileChanges(events)).toHaveLength(0);
  });

  it("derives a write event", () => {
    const events: EngineEvent[] = [
      { kind: "tool_use", tool: "Write", detail: "src/foo.ts new content" },
    ];
    const changes = deriveFileChanges(events);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.path).toBe("src/foo.ts");
    expect(changes[0]!.op).toBe("write");
  });

  it("derives an edit event", () => {
    const events: EngineEvent[] = [
      { kind: "tool_use", tool: "Edit", detail: "src/bar.ts old → new" },
    ];
    const changes = deriveFileChanges(events);
    expect(changes[0]!.op).toBe("edit");
  });

  it("last op wins for same path", () => {
    const events: EngineEvent[] = [
      { kind: "tool_use", tool: "Write", detail: "src/a.ts" },
      { kind: "tool_use", tool: "Edit", detail: "src/a.ts" },
    ];
    const changes = deriveFileChanges(events);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.op).toBe("edit");
  });

  it("attaches delta from tool_result", () => {
    const events: EngineEvent[] = [
      { kind: "tool_use", tool: "Edit", detail: "src/x.ts" },
      { kind: "tool_result", tool: "Edit", detail: "src/x.ts +3 -1" },
    ];
    const changes = deriveFileChanges(events);
    expect(changes[0]!.delta).toBe("+3 -1");
  });
});
