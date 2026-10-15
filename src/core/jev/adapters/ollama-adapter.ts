// OllamaAdapter — talks to a local Ollama / LM Studio HTTP endpoint (default
// http://localhost:11434). Installs nothing: it assumes the endpoint is already
// running and configured by the server. Any transport/parse failure degrades to
// ABSTAIN so a judgment call can never throw into (or block) a gate.

import { ABSTAIN, type JevAdapter, type JevContext, type JevJudgment, type JevVerdict } from "../types.js";

const DEFAULT_ENDPOINT = "http://localhost:11434";
const DEFAULT_TIMEOUT_MS = 20_000;

const VERDICTS: readonly JevVerdict[] = ["approve", "discard", "abstain"];

function coerce(raw: unknown): JevJudgment {
  if (raw === null || typeof raw !== "object") return ABSTAIN;
  const r = raw as Record<string, unknown>;
  const verdict = VERDICTS.includes(r["verdict"] as JevVerdict) ? (r["verdict"] as JevVerdict) : "abstain";
  const rationale = typeof r["rationale"] === "string" ? r["rationale"] : "";
  const confidenceRaw = typeof r["confidence"] === "number" ? r["confidence"] : 0;
  const confidence = Math.min(1, Math.max(0, confidenceRaw));
  return { verdict, rationale, confidence };
}

export interface OllamaOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaAdapter implements JevAdapter {
  readonly model: string;
  readonly #endpoint: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(model: string, opts: OllamaOptions = {}) {
    this.model = model;
    this.#endpoint = (opts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  async judge(prompt: string, _ctx: JevContext): Promise<JevJudgment> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(`${this.#endpoint}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt, stream: false, format: "json" }),
        signal: controller.signal,
      });
      if (!res.ok) return ABSTAIN;
      const body = (await res.json()) as { response?: string };
      if (typeof body.response !== "string") return ABSTAIN;
      return coerce(JSON.parse(body.response));
    } catch {
      return ABSTAIN; // network error, timeout, bad JSON → abstain
    } finally {
      clearTimeout(timer);
    }
  }
}
