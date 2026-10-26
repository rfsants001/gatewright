// useTerminalSize — terminal dimensions + a responsive mode, re-rendering on
// SIGWINCH (process.stdout 'resize'). compact <60, normal 60–119, wide ≥120.

import { useEffect, useState } from "react";

export type TerminalMode = "compact" | "normal" | "wide";

export interface TerminalSize {
  cols: number;
  rows: number;
  mode: TerminalMode;
}

/** Pure: classify a column count into a responsive mode. */
export function terminalMode(cols: number): TerminalMode {
  if (cols < 60) return "compact";
  if (cols < 120) return "normal";
  return "wide";
}

function read(): TerminalSize {
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  return { cols, rows, mode: terminalMode(cols) };
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(read);
  useEffect(() => {
    const onResize = (): void => setSize(read());
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);
  return size;
}
