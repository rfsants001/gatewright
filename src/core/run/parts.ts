// The run cockpit's data model: a stream of engine events becomes Parts grouped
// into Turns. Pure types + guards; no I/O, no React. Projection lives in
// project-turns.ts. Mirrors OpenCode's part model (clean-room, MIT); impl is ours.

/** Lifecycle of a single part as the stream arrives. */
export type PartStatus = "streaming" | "running" | "completed" | "error";

/** Assistant prose. Streaming chunks aggregate into one block (see project-turns). */
export interface TextPart {
  type: "text";
  text: string;
  status: PartStatus;
}

/** One tool call, matched to its result when it arrives. */
export interface ToolPart {
  type: "tool";
  /** Raw engine name (e.g. "Bash"); keep for debug/replay. */
  name: string;
  /** Normalized name from canonicalToolName (e.g. "shell"); keys grouping/display. */
  canonicalName: string;
  input: unknown;
  /** Short preview of the tool result, set once the result arrives. */
  result?: string;
  status: PartStatus;
  /** Epoch ms; enables duration rendering ("3.2s"). */
  startedAt: number;
  endedAt?: number;
}

/** A thinking block — a first-class citizen, not discarded. */
export interface ReasoningPart {
  type: "reasoning";
  text: string;
  /** First significant sentence, extracted for the collapsed label. */
  summary?: string;
  status: PartStatus;
  startedAt: number;
  endedAt?: number;
}

export type Part = TextPart | ToolPart | ReasoningPart;

/**
 * One user prompt and the assistant's full response to it. Token counts come from
 * the engine's usage events; cost is NOT stored here — it is derived at render
 * time from the pricing table (feat run-conversation-structure), keeping the model
 * free of pricing concerns.
 */
export interface Turn {
  userMessage: string;
  parts: Part[];
  tokensIn: number;
  tokensOut: number;
  /** Cache hit ratio 0..1 (0.78 → "cache 78%"); undefined when unknown. */
  cacheHit?: number;
}

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === "tool";
}

export function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === "reasoning";
}

/** A part is still in flight (streaming or running), not yet completed/errored. */
export function isPartActive(part: Part): boolean {
  return part.status === "streaming" || part.status === "running";
}

/** Duration in ms for a timed part, once ended; undefined while still running. */
export function partDurationMs(part: ToolPart | ReasoningPart): number | undefined {
  return part.endedAt === undefined ? undefined : part.endedAt - part.startedAt;
}
