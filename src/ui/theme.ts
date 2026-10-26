// Shared visual language, extracted from the Phase 29/30 cockpit (colors by run
// state and skill category). Screens import from here instead of literal color
// strings so the whole TUI reads as one product. Pure — no Ink, no I/O.

export const PRIMARY = "cyan";
export const SUCCESS = "green";
export const WARNING = "yellow";
export const ERROR = "red";
export const DIM = "gray";
export const ACCENT = "magenta";
export const MUTED = "blue";

/** Run/check state, spanning the engine's ControlState and generic health words. */
export type StatusLike =
  | "IDLE"
  | "RUNNING"
  | "PAUSED"
  | "PASSED"
  | "FAILED"
  | "CANCELLED"
  | "idle"
  | "ok"
  | "warn"
  | "bad";

/** The cockpit's state → color mapping, promoted for every screen to share. */
export function statusColor(state: StatusLike): string {
  switch (state) {
    case "RUNNING":
      return PRIMARY;
    case "PASSED":
    case "ok":
      return SUCCESS;
    case "FAILED":
    case "bad":
      return ERROR;
    case "PAUSED":
    case "CANCELLED":
    case "warn":
      return WARNING;
    default:
      return DIM;
  }
}

/** Skill-category colors, shared by the cockpit sidebar and the Skills screen. */
const CATEGORY_COLORS: Record<string, string> = {
  architecture: MUTED,
  development: SUCCESS,
  quality: ACCENT,
  workflows: PRIMARY,
  sdd: WARNING,
  provisioning: ERROR,
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "white";
}
