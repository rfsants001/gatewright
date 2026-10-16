// Marketplace contracts — runtime guards that a third-party candidate conforms to
// the Gate / Validator shape before it is admitted. No eval: callers hand us an
// already-constructed object; we only verify its shape.

export interface ContractResult {
  ok: boolean;
  problems: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

/** Verify a candidate conforms to the Gate contract (name/description/events/appliesTo/check). */
export function validateGateContract(candidate: unknown): ContractResult {
  const problems: string[] = [];
  if (!isRecord(candidate)) return { ok: false, problems: ["candidate is not an object"] };
  if (typeof candidate["name"] !== "string" || candidate["name"].trim() === "") problems.push("missing string 'name'");
  if (typeof candidate["description"] !== "string") problems.push("missing string 'description'");
  if (!Array.isArray(candidate["events"]) || candidate["events"].length === 0) problems.push("'events' must be a non-empty array");
  if (typeof candidate["appliesTo"] !== "function") problems.push("'appliesTo' must be a function");
  if (typeof candidate["check"] !== "function") problems.push("'check' must be a function");
  return { ok: problems.length === 0, problems };
}

/** Verify a candidate conforms to the Validator contract (id/validate). */
export function validateValidatorContract(candidate: unknown): ContractResult {
  const problems: string[] = [];
  if (!isRecord(candidate)) return { ok: false, problems: ["candidate is not an object"] };
  if (typeof candidate["id"] !== "string" || candidate["id"].trim() === "") problems.push("missing string 'id'");
  if (typeof candidate["validate"] !== "function") problems.push("'validate' must be a function");
  return { ok: problems.length === 0, problems };
}
