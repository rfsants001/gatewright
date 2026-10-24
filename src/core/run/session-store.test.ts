import { describe, it, expect } from "vitest";
import {
  emptySessionStore,
  addSession,
  activateSession,
  activeSession,
  updateSession,
  listSessions,
} from "./session-store.js";
import type { Session } from "./session-store.js";

function makeSession(id: string): Session {
  return { id, events: [], gates: [], state: "IDLE", label: `Session ${id}` };
}

describe("session store", () => {
  it("starts empty", () => {
    const store = emptySessionStore();
    expect(listSessions(store)).toHaveLength(0);
    expect(activeSession(store)).toBeNull();
  });

  it("adds and activates", () => {
    const s = emptySessionStore();
    const store = addSession(s, makeSession("a"));
    expect(listSessions(store)).toHaveLength(1);
    expect(activeSession(store)?.id).toBe("a");
  });

  it("activates a different session without destroying others", () => {
    let store = emptySessionStore();
    store = addSession(store, makeSession("a"));
    store = addSession(store, makeSession("b"));
    store = activateSession(store, "a");
    expect(activeSession(store)?.id).toBe("a");
    expect(listSessions(store)).toHaveLength(2);
  });

  it("ignores activation of unknown id", () => {
    const store = addSession(emptySessionStore(), makeSession("a"));
    const unchanged = activateSession(store, "z");
    expect(unchanged.activeId).toBe("a");
  });

  it("updates session fields", () => {
    let store = addSession(emptySessionStore(), makeSession("a"));
    store = updateSession(store, "a", { label: "My Run" });
    expect(listSessions(store)[0]?.label).toBe("My Run");
  });
});
