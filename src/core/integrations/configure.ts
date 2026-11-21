// Headless governed configurator — the propose/apply pattern extracted from
// src/desktop/bridge.ts into reusable, injectable core functions (no Electron).
//
// Caller is responsible for obtaining human approval between proposeIntegration
// and applyIntegration — that gate is the fail-safe (NF-001, RT-CFG-3).

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { complete as defaultComplete } from "../../app/providers.js";
import {
  applyChange,
  changeRevision,
  checkProposalSources,
  customizationPrompt,
  describeChange,
  parseChange,
  type Change,
} from "../../app/customize.js";
import type { Provider } from "../../app/providers.js";
import type { IntegrationSpec } from "./spec.js";
import { finishOperation, recordStep, startOperation } from "./operations.js";
import type { InstallEvent, InstallReporter } from "./install-report.js";
import type { Executor } from "../provision/types.js";
import { acquireInstallationLock } from "./install-lock.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { Change };

export interface ProposeSuccess {
  revision: string;
  change: Change;
  plan: ReturnType<typeof describeChange>;
}

export interface ProposeFailure {
  message: string;
}

export type ProposeResult = ProposeSuccess | ProposeFailure;

/** Injected completion function signature — matches complete() from providers.ts. */
export type CompleteFn = typeof defaultComplete;

// ---------------------------------------------------------------------------
// proposeIntegration
// ---------------------------------------------------------------------------

/**
 * Build an AI proposal for a given IntegrationSpec.
 *
 * Returns a typed Change + revision + plan on success, or a plain message
 * when the AI output cannot be parsed as a valid Change.
 *
 * The `complete` parameter is injectable for tests; production callers omit it.
 */
export async function proposeIntegration(opts: {
  cwd: string;
  spec: IntegrationSpec;
  provider: Provider;
  model?: string;
  reference?: string;
  complete?: CompleteFn;
  prompt?: string;
}): Promise<ProposeResult> {
  const { cwd, spec, reference } = opts;
  const completeFn = opts.complete ?? defaultComplete;
  const provider: Provider = opts.model
    ? { ...opts.provider, model: opts.model }
    : opts.provider;

  // Build input text — mirrors bridge.ts customize.propose construction.
  const location = spec.endpoint ?? spec.package ?? "";
  const prompt = opts.prompt ?? `Configure uma integração do tipo "${spec.kind}" em ${location}. Intenção: ${spec.intent}`;
  const input = reference ? `${prompt}\n\nDocumentação fornecida:\n${reference}` : prompt;

  const result = await completeFn(provider, input, AbortSignal.timeout(60_000), customizationPrompt());

  let change: Change;
  try { change = parseChange(result.text); }
  catch { return { message: result.text.slice(0, 1000) }; }

  checkProposalSources(change, input);
  const revision = changeRevision(cwd, change);
  return { revision, change, plan: describeChange(cwd, change) };
}

// ---------------------------------------------------------------------------
// applyIntegration
// ---------------------------------------------------------------------------

/**
 * Apply a previously proposed Change after the caller has obtained human approval.
 *
 * Records PROPOSAL_CONFIRMED → (apply) → PROPOSAL_APPLIED in the integrations
 * journal. On failure records PROPOSAL_FAILED and rethrows so the caller can
 * surface the error.
 *
 * Journal path: <cwd>/.gatewright/integrations.json — identical to bridge.ts.
 */
export async function applyIntegration(opts: {
  cwd: string;
  change: Change;
  revision: string;
  executor?: Executor;
  progress?: (data: { operationId: string; seq: number; step: InstallEvent }) => void;
}): Promise<{ operationId?: string; warning?: string }> {
  const { cwd, change, revision } = opts;
  const operationId = randomUUID();
  const release = acquireInstallationLock(cwd, operationId);
  const journal = new Journal(
    new FileArtifactStore(),
    join(cwd, ".gatewright", "integrations.json"),
  );
  const record = (type: string) =>
    journal.append({ type, at: new Date().toISOString(), payload: { revision, kind: change.kind } });

  try {
    record("PROPOSAL_CONFIRMED");
    const recipe = ["npm-mcp", "container", "git-project", "graphify"].includes(change.kind);
    let warning: string | undefined;
    let reporter: InstallReporter | undefined;
    if (recipe) {
      startOperation(cwd, { id: operationId, revision, recipeKind: change.kind, recipe: change, steps: [] });
      reporter = { operationId, report: (step) => {
        const seq = recordStep(cwd, operationId, step);
        opts.progress?.({ operationId, seq, step });
      } };
    }
    try { await applyChange(cwd, change, revision, opts.executor, reporter); }
    catch (error) {
      try { if (recipe) finishOperation(cwd, operationId, "partial"); record("PROPOSAL_FAILED"); } catch { /* Preserve the original failure and resource evidence. */ }
      throw error;
    }
    // Installation has committed. A journal failure must never invite a blind retry.
    try { record("PROPOSAL_APPLIED"); if (recipe) finishOperation(cwd, operationId, "succeeded"); }
    catch { warning = "A integração foi aplicada, mas o registro final falhou. Reconcilie a operação; não reinstale."; }
    return { ...(recipe ? { operationId } : {}), ...(warning ? { warning } : {}) };
  } finally {
    release();
  }
}
