// Summaries for collapsed groups: a counts label of finished work
// ("3 commands, 1 edit, 2 thoughts, 4 reads") plus a busy label for whatever is
// still running ("Running command…"). Pure. Mirrors OpenCode's activity-summary
// (clean-room, MIT); impl is ours.

import { isPartActive, type Part } from "./parts.js";

/** Status noun for a part still in flight — stable so it doesn't flicker. */
export function busyLabel(part: Part): string {
  if (part.type === "reasoning") return "Thinking…";
  if (part.type === "tool") {
    const noun = part.canonicalName === "shell" ? "command" : part.canonicalName;
    const verb = part.status === "streaming" ? "Preparing" : "Running";
    return `${verb} ${noun}…`;
  }
  return "Working…";
}

type CountKey = "command" | "edit" | "thought" | "read" | "tool";
const ORDER: readonly CountKey[] = ["command", "edit", "thought", "read", "tool"];

/** Which count bucket a finished part falls into (null = not counted). */
function bucket(part: Part): CountKey | null {
  if (part.type === "reasoning") return part.text.trim() ? "thought" : null;
  if (part.type !== "tool") return null;
  switch (part.canonicalName) {
    case "shell":
      return "command";
    case "edit":
    case "write":
    case "patch":
      return "edit";
    case "read":
      return "read";
    default:
      return "tool";
  }
}

function plural(count: number, noun: CountKey): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface GroupSummary {
  /** e.g. "3 commands, 1 edit, 2 reads", or a busy label while nothing has finished. */
  label: string;
  /** True while any part in the group is still streaming/running. */
  active: boolean;
}

/**
 * Summarize a group's parts: count only finished work by type, in a stable order.
 * While nothing has finished yet, fall back to the first active part's busy label.
 */
export function summarizeGroup(parts: Part[]): GroupSummary {
  const counts: Record<CountKey, number> = { command: 0, edit: 0, thought: 0, read: 0, tool: 0 };
  let active = false;
  let firstActive: Part | undefined;

  for (const part of parts) {
    if (isPartActive(part)) {
      active = true;
      firstActive ??= part;
      continue;
    }
    const key = bucket(part);
    if (key) counts[key]++;
  }

  const label = ORDER.filter((k) => counts[k] > 0)
    .map((k) => plural(counts[k], k))
    .join(", ");

  return { label: label || (firstActive ? busyLabel(firstActive) : ""), active };
}
