// HealthStatus domain — persists the last diagnostic attempt per integration name
// and derives the live health view by combining stored evidence with current config state.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { managedMcpReady, managedMcpServers } from "./managed-mcp.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verification = "never" | "checking" | "passed" | "failed" | "unknown";

export interface HealthStatus {
  configured: boolean;
  artifactReady: boolean;
  lastAttemptAt?: string;
  verification: Verification;
  latencyMs?: number;
  checkedRevision?: string;
  errorCode?: string;
  auth?: "unknown" | "ok" | "failed";
  actions: string[];
}

/** What a caller records after running a diagnostic. */
export interface HealthAttemptResult {
  verification: "passed" | "failed";
  latencyMs?: number;
  errorCode?: string;
  checkedRevision: string;
}

// ---------------------------------------------------------------------------
// Stored shape (keyed JSON at <cwd>/.gatewright/health.json)
// ---------------------------------------------------------------------------

interface StoredAttempt {
  lastAttemptAt: string;
  verification: "passed" | "failed";
  latencyMs?: number;
  errorCode?: string;
  checkedRevision: string;
}

type HealthStore = Record<string, StoredAttempt>;

// ---------------------------------------------------------------------------
// Revision derivation
// ---------------------------------------------------------------------------

/**
 * Compute a stable revision string for an integration's current config.
 * Based on the serialized ManagedMcpServer entry (or absence) for `name`.
 * When config changes, the revision changes and old evidence expires.
 */
export function integrationRevision(cwd: string, name: string): string {
  const servers = managedMcpServers(cwd, false);
  const server = Object.hasOwn(servers, name) ? servers[name] : null;
  return createHash("sha256")
    .update(JSON.stringify({ cwd, name, server }))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

const store = new FileArtifactStore();

function healthPath(cwd: string): string {
  return join(cwd, ".gatewright", "health.json");
}

function readStore(cwd: string): HealthStore {
  try {
    const raw = store.read(healthPath(cwd));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as HealthStore;
  } catch {
    return {};
  }
}

function writeStore(cwd: string, data: HealthStore): void {
  try {
    store.write(healthPath(cwd), `${JSON.stringify(data, null, 2)}\n`);
  } catch {
    // best-effort; never throw from health recording
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a diagnostic attempt for `name` under `cwd`.
 * `result.checkedRevision` should be the value from `integrationRevision(cwd, name)`
 * at the time the diagnostic ran.
 */
export function recordHealthAttempt(cwd: string, name: string, result: HealthAttemptResult): void {
  const data = readStore(cwd);
  const entry: StoredAttempt = {
    lastAttemptAt: new Date().toISOString(),
    verification: result.verification,
    checkedRevision: result.checkedRevision,
  };
  if (result.latencyMs !== undefined) entry.latencyMs = result.latencyMs;
  if (result.errorCode !== undefined) entry.errorCode = result.errorCode;
  data[name] = entry;
  writeStore(cwd, data);
}

/**
 * Derive the full HealthStatus for `name` by combining persisted evidence with
 * the live config state. Never throws.
 *
 * Evidence expiry: when `stored.checkedRevision` differs from the current
 * `integrationRevision(cwd, name)`, the verification is degraded to `"unknown"`
 * (config changed since last test; re-test needed).
 */
export function readHealth(cwd: string, name: string): HealthStatus {
  let configured = false;
  let artifactReady = false;
  try {
    const servers = managedMcpServers(cwd, false);
    configured = Object.hasOwn(servers, name);
    if (configured) {
      const server = servers[name];
      if (server !== undefined) {
        artifactReady = managedMcpReady(cwd, name, server);
      }
    }
  } catch {
    // safe default
  }

  const data = readStore(cwd);
  const stored = Object.hasOwn(data, name) ? data[name] : undefined;

  if (!stored) {
    return {
      configured,
      artifactReady,
      verification: "never",
      actions: ["test"],
    };
  }

  // Check whether stored evidence is still valid for the current config.
  let currentRevision: string;
  try {
    currentRevision = integrationRevision(cwd, name);
  } catch {
    currentRevision = "";
  }

  const revisionExpired = stored.checkedRevision !== currentRevision;
  const verification: Verification = revisionExpired ? "unknown" : stored.verification;

  const status: HealthStatus = {
    configured,
    artifactReady,
    lastAttemptAt: stored.lastAttemptAt,
    verification,
    checkedRevision: stored.checkedRevision,
    actions: [],
  };

  if (stored.latencyMs !== undefined) status.latencyMs = stored.latencyMs;
  if (stored.errorCode !== undefined) status.errorCode = stored.errorCode;

  status.actions =
    verification === "passed" ? [] :
    verification === "failed" ? ["retry"] :
    ["test"]; // "never" | "unknown"

  return status;
}
