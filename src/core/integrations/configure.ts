// Headless governed configurator — the propose/apply pattern extracted from
// src/desktop/bridge.ts into reusable, injectable core functions (no Electron).
//
// Caller is responsible for obtaining human approval between proposeIntegration
// and applyIntegration — that gate is the fail-safe (NF-001, RT-CFG-3).

import { join } from "node:path";
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
}): Promise<ProposeResult> {
  const { cwd, spec, reference } = opts;
  const completeFn = opts.complete ?? defaultComplete;
  const provider: Provider = opts.model
    ? { ...opts.provider, model: opts.model }
    : opts.provider;

  // Build input text — mirrors bridge.ts customize.propose construction.
  const location = spec.endpoint ?? spec.package ?? "";
  const prompt = `Configure uma integração do tipo "${spec.kind}" em ${location}. Intenção: ${spec.intent}`;
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
}): Promise<void> {
  const { cwd, change, revision } = opts;
  const journal = new Journal(
    new FileArtifactStore(),
    join(cwd, ".gatewright", "integrations.json"),
  );
  const record = (type: string) =>
    journal.append({ type, at: new Date().toISOString(), payload: { revision, kind: change.kind } });

  record("PROPOSAL_CONFIRMED");
  try {
    await applyChange(cwd, change, revision);
  } catch (error) {
    record("PROPOSAL_FAILED");
    throw error;
  }
  record("PROPOSAL_APPLIED");
}
