// Logo — the ASCII wordmark, rendered with figlet. Font adapts to terminal width.

import figlet from "figlet";
import { Box, Text } from "ink";

function banner(width: number): string {
  const font: figlet.Fonts = width < 56 ? "Mini" : "Small";
  try {
    return figlet.textSync("gatewright", { font });
  } catch {
    return "gatewright";
  }
}

export function Logo({ width, tagline = true }: { width?: number; tagline?: boolean }) {
  const cols = width ?? process.stdout.columns ?? 80;
  const lines = banner(cols).replace(/\s+$/, "").split("\n");
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} color="cyan">
          {line}
        </Text>
      ))}
      {tagline ? <Text dimColor>  headless guardrails for AI code agents</Text> : null}
    </Box>
  );
}
