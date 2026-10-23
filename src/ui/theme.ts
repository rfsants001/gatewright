import type { ControlState } from "../core/control/control-state.js";

export const PRIMARY = "cyan";
export const SUCCESS = "green";
export const WARNING = "yellow";
export const ERROR = "red";
export const MUTED = "blue";
export const ACCENT = "magenta";

export const CAT_COLORS: Record<string, string> = {
  architecture: MUTED,
  development: SUCCESS,
  quality: ACCENT,
  workflows: PRIMARY,
  sdd: WARNING,
  provisioning: ERROR,
};

export function statusColor(state: ControlState | "idle" | "ok" | "warn" | "bad"): string {
  switch (state) {
    case "PASSED":
    case "ok":
      return SUCCESS;
    case "FAILED":
    case "bad":
      return ERROR;
    case "CANCELLED":
    case "warn":
      return WARNING;
    case "RUNNING":
      return PRIMARY;
    default:
      return "gray";
  }
}

export function categoryColor(cat: string): string {
  return CAT_COLORS[cat] ?? "white";
}
