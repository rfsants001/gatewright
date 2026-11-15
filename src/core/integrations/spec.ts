// IntegrationSpec — the user-supplied declaration that kicks off config-por-IA.
// The AI reads what the tool exposes and generates the rest of the config;
// the spec only carries the minimum the user must declare up front.

import { z } from "zod";
import type { ModuleKind } from "./modules.js";

// ModuleKind values as a Zod enum so the schema stays in sync with the type.
const moduleKindSchema = z.enum(["jev", "advisor", "saver", "model", "mcp"] as const) satisfies z.ZodType<ModuleKind>;

export const integrationSpec = z
  .object({
    kind: moduleKindSchema,
    endpoint: z.string().min(1).optional(),
    package: z.string().min(1).optional(),
    intent: z.string().min(1, "intent must not be empty"),
  })
  .refine((v) => v.endpoint !== undefined || v.package !== undefined, {
    message: "at least one of endpoint or package must be provided",
  });

export type IntegrationSpec = z.infer<typeof integrationSpec>;

/** Parse an unknown value into an `IntegrationSpec` or throw a descriptive error. */
export function parseIntegrationSpec(raw: unknown): IntegrationSpec {
  return integrationSpec.parse(raw);
}
