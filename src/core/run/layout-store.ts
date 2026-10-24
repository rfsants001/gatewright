// Persists split-pane layout preferences to ~/.gatewright/layout.json.
// Sidebar width defaults to 40 cols; collapses to overlay when terminal < 100 cols.

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

export interface LayoutConfig {
  sidebarWidth: number;
  sidebarOpen: boolean;
}

const DEFAULT: LayoutConfig = { sidebarWidth: 40, sidebarOpen: true };

function layoutPath(): string {
  const home = process.env.GATEWRIGHT_HOME ?? join(homedir(), ".gatewright");
  return join(home, "layout.json");
}

export function readLayout(): LayoutConfig {
  try {
    const raw = readFileSync(layoutPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<LayoutConfig>;
    return {
      sidebarWidth: typeof parsed.sidebarWidth === "number" ? parsed.sidebarWidth : DEFAULT.sidebarWidth,
      sidebarOpen: typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : DEFAULT.sidebarOpen,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeLayout(config: LayoutConfig): void {
  try {
    const p = layoutPath();
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, JSON.stringify(config, null, 2));
  } catch {
    // best-effort
  }
}

/** Effective sidebar width given terminal width. Overlay (<100 cols) renders on top. */
export function effectiveSidebarWidth(termCols: number, config: LayoutConfig): number {
  if (!config.sidebarOpen) return 0;
  if (termCols < 100) return 0; // overlay, handled by caller
  return Math.min(config.sidebarWidth, Math.floor(termCols / 3));
}

/** True when the sidebar should render as a floating overlay. */
export function isSidebarOverlay(termCols: number): boolean {
  return termCols < 100;
}
