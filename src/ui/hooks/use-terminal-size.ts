import { useEffect, useState } from "react";

export type TerminalMode = "compact" | "normal" | "wide";

function classify(cols: number): TerminalMode {
  if (cols < 60) return "compact";
  if (cols < 120) return "normal";
  return "wide";
}

function snapshot(): { cols: number; rows: number } {
  return { cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 };
}

export function useTerminalSize(): { cols: number; rows: number; mode: TerminalMode } {
  const [size, setSize] = useState(snapshot);

  useEffect(() => {
    const handler = (): void => setSize(snapshot());
    process.stdout.on("resize", handler);
    return () => { process.stdout.off("resize", handler); };
  }, []);

  return { ...size, mode: classify(size.cols) };
}
