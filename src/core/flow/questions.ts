// Structured user-input protocol for the end-to-end flow. A one-shot engine run
// can't pause to ask, so when it needs the human it emits a <gate-ask> block; the
// flow parses it and renders the matching UI (text / confirm / select / multiselect),
// collects the answers, and feeds them into the next step. Parsing is tolerant —
// malformed or absent blocks yield no questions rather than throwing.

export type QuestionType = "text" | "confirm" | "select" | "multiselect";

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Options for select / multiselect. */
  options?: string[];
}

export type AnswerValue = string | string[] | boolean;
export type Answers = Record<string, AnswerValue>;

const BLOCK = /<gate-ask>\s*([\s\S]*?)\s*<\/gate-ask>/;
const TYPES: QuestionType[] = ["text", "confirm", "select", "multiselect"];

/** Extract and validate the questions in a <gate-ask> block; [] when absent/invalid. */
export function parseQuestions(text: string): Question[] {
  const m = text.match(BLOCK);
  if (!m) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1] ?? "");
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown })?.questions;
  if (!Array.isArray(raw)) return [];

  const out: Question[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) continue;
    const q = item as Record<string, unknown>;
    const type = q["type"];
    const prompt = q["prompt"];
    if (typeof prompt !== "string" || !TYPES.includes(type as QuestionType)) continue;
    const id = typeof q["id"] === "string" && q["id"] ? (q["id"] as string) : `q${i + 1}`;
    const options = Array.isArray(q["options"]) ? (q["options"] as unknown[]).filter((o): o is string => typeof o === "string") : undefined;
    if ((type === "select" || type === "multiselect") && (!options || options.length === 0)) continue;
    out.push({ id, type: type as QuestionType, prompt, ...(options ? { options } : {}) });
  }
  return out;
}

/** True when the text contains a (parseable) gate-ask request. */
export function hasQuestions(text: string): boolean {
  return parseQuestions(text).length > 0;
}

/** Remove any <gate-ask> block(s) so the surrounding prose can be shown on its own. */
export function stripQuestions(text: string): string {
  return text.replace(/<gate-ask>[\s\S]*?<\/gate-ask>/g, "").trim();
}
