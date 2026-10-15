// Content atomic validators — declared-vs-actual totals, id uniqueness, required
// section coverage, basic markdown structure, and a minimal key/type schema.

import { fail, PASS, type Finding, type Validator } from "../types.js";

/** input: { items: unknown[]; total: number } → items.length must equal total. */
export function countTotals(): Validator {
  return {
    id: "count-totals",
    validate: (input) => {
      const rec = input as { items?: unknown; total?: unknown };
      if (!Array.isArray(rec.items) || typeof rec.total !== "number") {
        return fail("count-totals", "expected { items: array, total: number }");
      }
      return rec.items.length === rec.total
        ? PASS
        : fail("count-totals", `declared total ${rec.total} ≠ actual ${rec.items.length}`);
    },
  };
}

/** input: array of strings or objects with `id` → all ids must be unique. */
export function idUniqueness(): Validator {
  return {
    id: "id-uniqueness",
    validate: (input) => {
      if (!Array.isArray(input)) return fail("id-uniqueness", "input is not an array");
      const ids = input.map((it) => (typeof it === "string" ? it : (it as { id?: unknown })?.id));
      const seen = new Set<unknown>();
      const dups = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) dups.add(String(id));
        seen.add(id);
      }
      return dups.size === 0 ? PASS : fail("id-uniqueness", `duplicate ids: ${[...dups].join(", ")}`);
    },
  };
}

/** input: markdown string → each required section (## heading text) must be present. */
export function sectionCoverage(required: readonly string[]): Validator {
  return {
    id: "section-coverage",
    validate: (input) => {
      if (typeof input !== "string") return fail("section-coverage", "input is not a string");
      const headings = new Set(
        input
          .split("\n")
          .filter((l) => /^#{1,6}\s+/.test(l))
          .map((l) => l.replace(/^#{1,6}\s+/, "").trim()),
      );
      const missing = required.filter((r) => !headings.has(r));
      return missing.length === 0 ? PASS : fail("section-coverage", `missing sections: ${missing.join(", ")}`);
    },
  };
}

/** input: markdown string → must have a top-level `# ` title and balanced code fences. */
export function markdownStructural(): Validator {
  return {
    id: "markdown-structural",
    validate: (input) => {
      if (typeof input !== "string") return fail("markdown-structural", "input is not a string");
      const findings: Finding[] = [];
      if (!input.split("\n").some((l) => /^#\s+\S/.test(l))) {
        findings.push({ code: "markdown-structural", message: "no top-level '# ' title", severity: "error" });
      }
      if ((input.match(/^```/gm)?.length ?? 0) % 2 !== 0) {
        findings.push({ code: "markdown-structural", message: "unbalanced code fences", severity: "error" });
      }
      return findings.length === 0 ? PASS : { ok: false, findings };
    },
  };
}

export type SchemaSpec = Record<string, "string" | "number" | "boolean" | "object" | "array">;

/** input: object → each key in `spec` must be present with the expected type. */
export function schema(spec: SchemaSpec): Validator {
  return {
    id: "schema",
    validate: (input) => {
      if (input === null || typeof input !== "object") return fail("schema", "input is not an object");
      const rec = input as Record<string, unknown>;
      const findings: Finding[] = [];
      for (const [key, expected] of Object.entries(spec)) {
        const value = rec[key];
        const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
        if (!(key in rec)) findings.push({ code: "schema", message: `missing key '${key}'`, severity: "error" });
        else if (actual !== expected) findings.push({ code: "schema", message: `key '${key}': expected ${expected}, got ${actual}`, severity: "error" });
      }
      return findings.length === 0 ? PASS : { ok: false, findings };
    },
  };
}
