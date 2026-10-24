// PURE session store: holds multiple concurrent run sessions, each with its own
// transcript, gates, journal path, and state. Sessions are lazy-mounted (transcript
// loaded on activate) and not destroyed on switch.

import type { EngineEvent } from "../engine/types.js";
import type { GateStatus } from "../../ui/run/gate-footer.js";
import type { ControlState } from "../control/control-state.js";

export interface Session {
  id: string;
  journalPath?: string;
  events: EngineEvent[];
  gates: GateStatus[];
  state: ControlState;
  /** Human label for tabs. */
  label: string;
}

export interface SessionStore {
  sessions: Session[];
  activeId: string | null;
}

export function emptySessionStore(): SessionStore {
  return { sessions: [], activeId: null };
}

/** Add a new session and activate it. Returns the updated store. */
export function addSession(store: SessionStore, session: Session): SessionStore {
  return {
    sessions: [...store.sessions, session],
    activeId: session.id,
  };
}

/** Activate a session by id. Returns the store unchanged if id not found. */
export function activateSession(store: SessionStore, id: string): SessionStore {
  if (!store.sessions.some((s) => s.id === id)) return store;
  return { ...store, activeId: id };
}

/** Get the active session, or null. */
export function activeSession(store: SessionStore): Session | null {
  if (!store.activeId) return null;
  return store.sessions.find((s) => s.id === store.activeId) ?? null;
}

/** Update a session by id (non-destructive: returns unchanged store if not found). */
export function updateSession(store: SessionStore, id: string, patch: Partial<Session>): SessionStore {
  return {
    ...store,
    sessions: store.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  };
}

/** List sessions in order. */
export function listSessions(store: SessionStore): Session[] {
  return store.sessions;
}

/** Generate a simple session id. */
export function newSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
