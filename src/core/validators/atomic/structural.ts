// Structural atomic validators — JSON validity, line count, numeric range,
// state-enum membership, and file existence. Each is a factory capturing its
// config and returning a Validator that reads defensively from `input`.

import { existsSync } from "node:fs";
import { fail, PASS, type Validator } from "../types.js";

/** input: string → must parse as JSON. */
export function jsonValidity(): Validator {
  return {
    id: "json-validity",
    validate: (input) => {
      if (typeof input !== "string") return fail("json-validity", "input is not a string");
      try {
        JSON.parse(input);
        return PASS;
      } catch (e) {
        return fail("json-validity", `invalid JSON: ${(e as Error).message}`);
      }
    },
  };
}

/** input: string → number of lines must not exceed `max`. */
export function lineCount(max: number): Validator {
  return {
    id: "line-count",
    validate: (input) => {
      if (typeof input !== "string") return fail("line-count", "input is not a string");
      const lines = input === "" ? 0 : input.split("\n").length;
      return lines <= max ? PASS : fail("line-count", `${lines} lines exceed limit ${max}`);
    },
  };
}

/** input: number → must be within [min, max]. */
export function range(min: number, max: number): Validator {
  return {
    id: "range",
    validate: (input) => {
      if (typeof input !== "number" || !Number.isFinite(input)) return fail("range", "input is not a finite number");
      return input >= min && input <= max ? PASS : fail("range", `${input} out of range [${min}, ${max}]`);
    },
  };
}

/** input: string → must be one of `allowed`. */
export function stateEnum(allowed: readonly string[]): Validator {
  const set = new Set(allowed);
  return {
    id: "state-enum",
    validate: (input) => {
      if (typeof input !== "string") return fail("state-enum", "input is not a string");
      return set.has(input) ? PASS : fail("state-enum", `'${input}' not in {${allowed.join(", ")}}`);
    },
  };
}

/** input: string path → must exist on disk. */
export function fileExistence(): Validator {
  return {
    id: "file-existence",
    validate: (input) => {
      if (typeof input !== "string" || input.trim() === "") return fail("file-existence", "input is not a path");
      return existsSync(input) ? PASS : fail("file-existence", `path does not exist: ${input}`);
    },
  };
}
