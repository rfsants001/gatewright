// Projects a normalized engine stream into the cockpit's Turn[] model. Pure and
// deterministic: same events → same turns. Aggregates streamed text, pairs each
// tool_use with its following tool_result, and attaches reasoning + usage.

import type { EngineEvent } from "../engine/types.js";
import { canonicalToolName } from "./tool-display.js";
import type { ReasoningPart, TextPart, ToolPart, Turn } from "./parts.js";

export interface ProjectTurnsOptions {
  /** The prompt that opened the (first) turn; the stream doesn't echo it. */
  userMessage?: string;
}

/** The tool_use inputs of one assistant message, in document order. */
function toolInputs(raw: unknown): unknown[] {
  const content = (raw as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b) => (b as { type?: unknown })?.type === "tool_use").map((b) => (b as { input?: unknown }).input);
}

/** Whether a tool_result's raw payload marks an error. */
function resultIsError(raw: unknown): boolean {
  const content = (raw as { message?: { content?: unknown } } | undefined)?.message?.content;
  if (!Array.isArray(content)) return false;
  const block = content.find((b) => (b as { type?: unknown })?.type === "tool_result");
  return Boolean((block as { is_error?: unknown })?.is_error);
}

function cacheRatio(tokensIn: number, cacheRead: number): number | undefined {
  const total = tokensIn + cacheRead;
  return total > 0 ? cacheRead / total : undefined;
}

export function projectTurns(events: EngineEvent[], options: ProjectTurnsOptions = {}): Turn[] {
  const turns: Turn[] = [];
  // Inputs are matched to tool_use events in order, even when one message
  // carries several tool calls (raw is shared across those events).
  const rawInputQueues = new Map<unknown, unknown[]>();

  let first = true;
  let current = newTurn(options.userMessage ?? "");
  let cacheReadAcc = 0;

  const hasContent = (t: Turn): boolean => t.parts.length > 0 || t.tokensIn > 0 || t.tokensOut > 0;

  function flush(): void {
    turns.push(current);
    first = false;
    current = newTurn("");
    cacheReadAcc = 0;
  }

  for (const ev of events) {
    switch (ev.kind) {
      case "assistant": {
        if (!ev.text) break;
        const last = current.parts[current.parts.length - 1];
        // Consecutive assistant chunks aggregate into one text block.
        if (last && last.type === "text") last.text += ev.text;
        else current.parts.push(textPart(ev.text));
        break;
      }
      case "reasoning": {
        if (!ev.text) break;
        const last = current.parts[current.parts.length - 1];
        if (last && last.type === "reasoning") last.text += ev.text;
        else current.parts.push(reasoningPart(ev.text));
        break;
      }
      case "tool_use": {
        const name = ev.tool ?? "tool";
        let queue = rawInputQueues.get(ev.raw);
        if (!queue) {
          queue = toolInputs(ev.raw);
          rawInputQueues.set(ev.raw, queue);
        }
        const input = queue.length ? queue.shift() : undefined;
        current.parts.push(toolPart(name, input));
        break;
      }
      case "tool_result": {
        // Attach to the most recent still-open tool part.
        for (let i = current.parts.length - 1; i >= 0; i--) {
          const part = current.parts[i]!;
          if (part.type === "tool" && part.result === undefined && part.status === "running") {
            part.result = ev.detail ?? "";
            part.status = resultIsError(ev.raw) ? "error" : "completed";
            break;
          }
        }
        break;
      }
      case "usage": {
        if (!ev.usage) break;
        current.tokensIn += ev.usage.tokensIn;
        current.tokensOut += ev.usage.tokensOut;
        cacheReadAcc += ev.usage.cacheRead;
        const ratio = cacheRatio(current.tokensIn, cacheReadAcc);
        if (ratio !== undefined) current.cacheHit = ratio;
        break;
      }
      case "result":
        flush();
        break;
      default:
        break;
    }
  }

  // A run that never emitted a terminal result still yields its open turn when it
  // holds anything; the very first (possibly empty) turn is kept only if nothing
  // else was produced, so a bare prompt still projects to one turn.
  if (hasContent(current) || (first && turns.length === 0)) turns.push(current);

  return turns;
}

function newTurn(userMessage: string): Turn {
  return { userMessage, parts: [], tokensIn: 0, tokensOut: 0 };
}

function textPart(text: string): TextPart {
  return { type: "text", text, status: "completed" };
}

function reasoningPart(text: string): ReasoningPart {
  return { type: "reasoning", text, status: "completed", startedAt: 0 };
}

function toolPart(name: string, input: unknown): ToolPart {
  return { type: "tool", name, canonicalName: canonicalToolName(name), input, status: "running", startedAt: 0 };
}
