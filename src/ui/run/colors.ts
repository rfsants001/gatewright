// Color scheme for the run transcript, keyed by canonical tool category. Pure:
// returns a style descriptor for <Text>, never touches Ink. Honors NO_COLOR by
// dropping color/dim (bold survives — it isn't color).

/** Style props applied to the `→` glyph and the canonical tool name. */
export interface GlyphStyle {
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
}

function noColor(): boolean {
  return Boolean(process.env.NO_COLOR);
}

/** Strip color under NO_COLOR, keeping non-color emphasis (bold). */
function apply(style: GlyphStyle): GlyphStyle {
  if (!noColor()) return style;
  const { color: _c, dimColor: _d, ...rest } = style;
  return rest;
}

/**
 * Category color for a tool, by canonical name:
 * - exploration (read/glob/grep/webfetch/websearch) → blue
 * - mutation (write/edit/patch) → yellow
 * - execution (shell) → green
 * - orchestration (subagent) → magenta
 * - skill/todowrite → cyan
 * - question (gate-ask) → white + bold (max emphasis)
 * - anything else → no color
 */
export function toolStyle(canonicalName: string): GlyphStyle {
  switch (canonicalName) {
    case "read":
    case "glob":
    case "grep":
    case "webfetch":
    case "websearch":
      return apply({ color: "blue" });
    case "write":
    case "edit":
    case "patch":
      return apply({ color: "yellow" });
    case "shell":
      return apply({ color: "green" });
    case "subagent":
    case "task":
      return apply({ color: "magenta" });
    case "skill":
    case "todowrite":
      return apply({ color: "cyan" });
    case "question":
      return apply({ color: "white", bold: true });
    default:
      return apply({});
  }
}

/** Reasoning headers read as a dim amber/orange tone. */
export function reasoningStyle(): GlyphStyle {
  return apply({ color: "yellow", dimColor: true });
}

/** Dim style for secondary rows (usage, summaries). */
export function dimStyle(): GlyphStyle {
  return apply({ dimColor: true });
}
