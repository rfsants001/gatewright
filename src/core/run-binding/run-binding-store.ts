// RunBindingStore — persistent map of [workspace][sessionKey] → runSlug.
// The index agent-coupled gates consult to answer "does this session own an active run?".

import type { ArtifactStore } from "../artifact-store/types.js";
import { isSafeSlug, runBindingsPath, workspaceHash } from "./paths.js";

/** sessionKey → runSlug for one workspace. */
export type WorkspaceBindings = Record<string, string>;

export interface RunBindingRegistry {
  version: number;
  workspaces: Record<string, WorkspaceBindings>;
}

export type ObserveResult =
  | { status: "observed"; value: RunBindingRegistry }
  | { status: "unavailable"; code: "MALFORMED" | "IO" };

export type RunBindingErrorCode = "UNSAFE_SLUG" | "UNAVAILABLE";

export class RunBindingError extends Error {
  readonly code: RunBindingErrorCode;
  constructor(code: RunBindingErrorCode, message: string) {
    super(message);
    this.name = "RunBindingError";
    this.code = code;
  }
}

function emptyRegistry(): RunBindingRegistry {
  return { version: 1, workspaces: {} };
}

function isRegistry(value: unknown): value is RunBindingRegistry {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["version"] === "number" && typeof v["workspaces"] === "object" && v["workspaces"] !== null;
}

export class RunBindingStore {
  readonly #store: ArtifactStore;
  readonly #path: string;

  constructor(store: ArtifactStore, path: string = runBindingsPath()) {
    this.#store = store;
    this.#path = path;
  }

  /** Read the registry. Absent → observed-empty (fail-open); corrupt/IO → unavailable. Never throws. */
  observe(): ObserveResult {
    let raw: string | null;
    try {
      raw = this.#store.read(this.#path);
    } catch {
      return { status: "unavailable", code: "IO" };
    }
    if (raw === null) return { status: "observed", value: emptyRegistry() };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRegistry(parsed)) return { status: "unavailable", code: "MALFORMED" };
      return { status: "observed", value: parsed };
    } catch {
      return { status: "unavailable", code: "MALFORMED" };
    }
  }

  /** The bindings map for `workspace` within an observed registry, or undefined. */
  bindingsFor(registry: RunBindingRegistry, workspace: string): WorkspaceBindings | undefined {
    return registry.workspaces[workspaceHash(workspace)];
  }
}
