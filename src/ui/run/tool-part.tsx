// Specialized one-line display for a tool call, by canonical type:
//   → edit   src/foo.ts  +12 -3        → grep   "useState"  src/
//   → shell  npm test  [3.2s]          → agent  Implement the auth flow…
// Reuses toolInputSummary (core) and toolStyle (colors). Expanded shows the result.

import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { partDurationMs, type ToolPart as ToolPartModel } from "../../core/run/parts.js";
import { toolInputSummary } from "../../core/run/tool-display.js";
import { toolStyle } from "./colors.js";

/** The short label shown after the glyph; a few tools read better renamed. */
export function displayName(canonicalName: string): string {
  switch (canonicalName) {
    case "subagent":
      return "agent";
    case "webfetch":
      return "fetch";
    case "todowrite":
      return "todo";
    default:
      return canonicalName;
  }
}

/** Trailing status tag: running, errored, or a completed duration. */
export function statusTag(part: ToolPartModel): string {
  if (part.status === "running" || part.status === "streaming") return "[running…]";
  if (part.status === "error") return "[error]";
  const dur = partDurationMs(part);
  return dur !== undefined && dur > 0 ? `[${(dur / 1000).toFixed(1)}s]` : "";
}

export function ToolPart({
  part,
  cwd,
  expanded,
}: {
  part: ToolPartModel;
  cwd?: string;
  expanded?: boolean;
}): ReactElement {
  const style = toolStyle(part.canonicalName);
  const name = displayName(part.canonicalName);
  const summary = toolInputSummary(part.canonicalName, part.input, cwd);
  const tag = statusTag(part);

  const line = (
    <Text>
      <Text {...style}>{`→ ${name}`}</Text>
      {summary ? <Text>{`  ${summary}`}</Text> : null}
      {tag ? <Text dimColor>{`  ${tag}`}</Text> : null}
    </Text>
  );

  if (!expanded || !part.result) return line;

  return (
    <Box flexDirection="column">
      {line}
      {part.result.split("\n").map((l, i) => (
        <Text key={i} dimColor>{`  ${l}`}</Text>
      ))}
    </Box>
  );
}
