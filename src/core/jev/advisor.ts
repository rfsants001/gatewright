// Advisor port — decouples gate judgment consumers from any specific advisory
// backend (Jev, external service, or nothing).
//
// Resolver semantics (resolveAdvisor):
//   1. Scan the effective config's modules (gate + project merged via store.resolve(cwd)).
//   2. If there is an ENABLED module with kind "advisor" and provider "external"
//      → return an ExternalAdvisor backed by that module's config. (First match wins.)
//   3. Otherwise look for a module with id "jev":
//        a. Present + enabled  → return a JevAdvisor.
//        b. Present + disabled → return null (explicitly turned off).
//        c. Absent             → fall back to the existing JevConfigStore behavior:
//           return a JevAdvisor; jevAdvise() already returns null when jev.config.enabled
//           is false, so unconfigured users see no change in behavior.
//   4. null means "no advisor" — the caller MUST skip consulting entirely.

import { z } from "zod";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { jevAdvise } from "./hook-advisory.js";
import type { ActionCard } from "./types.js";

// ---------------------------------------------------------------------------
// Public contracts
// ---------------------------------------------------------------------------

export interface AdvisorVerdict {
  verdict: "approve" | "discard" | "abstain";
  confidence?: number;
  rationale?: string;
}

export interface Advisor {
  advise(feature: string, summary: string): Promise<AdvisorVerdict | null>;
}

/** The type of the jevAdvise function, used for injection in tests. */
export type JevAdviseFn = (feature: string, summary: string) => Promise<ActionCard | null>;

// ---------------------------------------------------------------------------
// JevAdvisor — wraps the existing jevAdvise() function (no logic duplication)
// ---------------------------------------------------------------------------

export class JevAdvisor implements Advisor {
  readonly #adviseFn: JevAdviseFn;

  /**
   * @param adviseFn - Injected for testing. Defaults to the real jevAdvise.
   *   Pass a stub to avoid hitting Ollama in unit tests.
   */
  constructor(adviseFn: JevAdviseFn = jevAdvise) {
    this.#adviseFn = adviseFn;
  }

  async advise(feature: string, summary: string): Promise<AdvisorVerdict | null> {
    const card: ActionCard | null = await this.#adviseFn(feature, summary);
    return card ? mapCard(card) : null;
  }
}

/** Map an ActionCard from hook-advisory into the Advisor contract. */
function mapCard(card: ActionCard): AdvisorVerdict {
  return {
    verdict: card.verdict,
    confidence: card.confidence,
    rationale: card.rationale,
  };
}

// ---------------------------------------------------------------------------
// ExternalAdvisor — HTTP transport for an external advisor (R2-005)
// ---------------------------------------------------------------------------

const verdictSchema = z.object({
  verdict: z.enum(["approve", "discard", "abstain"]),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
});

export class ExternalAdvisor implements Advisor {
  readonly #config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.#config = config;
  }

  async advise(feature: string, summary: string): Promise<AdvisorVerdict | null> {
    const endpoint = typeof this.#config["endpoint"] === "string" ? this.#config["endpoint"] : null;
    if (!endpoint) return null;
    const model = typeof this.#config["model"] === "string" ? this.#config["model"] : undefined;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature, summary, ...(model ? { model } : {}) }),
      });
      if (!response.ok) return null;
      const parsed = verdictSchema.safeParse(await response.json());
      if (!parsed.success) return null;
      return { verdict: parsed.data.verdict, ...(parsed.data.confidence !== undefined ? { confidence: parsed.data.confidence } : {}), ...(parsed.data.rationale !== undefined ? { rationale: parsed.data.rationale } : {}) };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the active advisor for a given working directory.
 *
 * Returns null when no advisor is available or when the jev module is explicitly
 * disabled — callers MUST skip consulting when null is returned.
 */
export function resolveAdvisor(cwd: string, store: ConfigStore = new ConfigStore(new FileArtifactStore())): Advisor | null {
  const cfg = store.resolve(cwd);
  const modules = cfg.modules ?? [];

  // 1. External advisor wins if present and enabled.
  const externalAdvisor = modules.find((m) => m.kind === "advisor" && m.provider === "external" && m.enabled);
  if (externalAdvisor) {
    return new ExternalAdvisor(externalAdvisor.config ?? {});
  }

  const localAdvisor = () => new JevAdvisor((feature, summary) => jevAdvise(feature, summary, cfg.jev));

  // 2. Look for an explicit jev module record.
  const jevModule = modules.find((m) => m.id === "jev");
  if (jevModule) {
    // Present: respect its enabled flag.
    return jevModule.enabled ? localAdvisor() : null;
  }

  // 3. No jev module record → legacy fallback: return JevAdvisor.
  // jevAdvise() reads JevConfigStore and returns null when jev is disabled,
  // so the behavior for users with no module record is exactly as before.
  return localAdvisor();
}
