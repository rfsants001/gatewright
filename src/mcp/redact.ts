// Secret redactor — default-deny allow-list for MCP resource payloads.
// Only keys explicitly listed in ALLOWED_KEYS are passed through; everything
// else is replaced with "[REDACTED]". Applies recursively to nested objects
// and arrays. Strings that look like secrets (env vars, tokens, keys) are
// also scrubbed even when they appear as values inside an allowed key.

/** Keys that are safe to expose verbatim via MCP resources. */
export const ALLOWED_KEYS = new Set([
  // GatewrightConfig safe fields
  "defaultEngine",
  "verbosity",
  // jev sub-object safe fields (enabled/model only; endpoint might carry auth)
  "jev",
  "enabled",
  "model",
  // packages
  "packages",
  "id",
  "installedAt",
  "version",
  "via",
  // usage / aggregation fields
  "totalTokensIn",
  "totalTokensOut",
  "totalCacheRead",
  "totalCostBrl",
  "byModel",
  "byRun",
  "tokensIn",
  "tokensOut",
  "cacheRead",
  "costBrl",
  "runSlug",
  "events",
  "count",
]);

/** Patterns in string values that signal a secret (env-var syntax, key-like tokens). */
const SECRET_VALUE_PATTERN =
  /^(sk-|ghp_|xoxb-|eyJ|AKIA|AIza|Bearer |token_|api[-_]?key)/i;

/** True when a string value looks like a secret. */
function looksLikeSecret(value: string): boolean {
  return SECRET_VALUE_PATTERN.test(value);
}

/**
 * Deep-redact an arbitrary object for safe MCP exposure.
 *
 * Rules (applied recursively):
 * 1. Object keys not in ALLOWED_KEYS are replaced with `"[REDACTED]"`.
 * 2. String values inside allowed keys that match SECRET_VALUE_PATTERN are
 *    also replaced with `"[REDACTED]"`.
 * 3. Arrays recurse element-by-element.
 * 4. Primitives other than strings pass through as-is (numbers, booleans, null).
 */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!ALLOWED_KEYS.has(k)) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = redact(v);
      }
    }
    return result;
  }

  if (typeof value === "string") {
    return looksLikeSecret(value) ? "[REDACTED]" : value;
  }

  // number, boolean, bigint, symbol — pass through
  return value;
}
