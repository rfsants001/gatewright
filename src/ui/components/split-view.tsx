import type { ReactNode } from "react";
import { Box } from "ink";
import type { TerminalMode } from "../hooks/use-terminal-size.js";

export function SplitView({
  left,
  right,
  leftWidth = "52%",
  mode,
}: {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: string;
  mode: TerminalMode;
}) {
  if (mode === "compact") {
    return (
      <Box flexDirection="column" gap={1}>
        {left}
        {right}
      </Box>
    );
  }
  return (
    <Box gap={1}>
      <Box flexDirection="column" width={leftWidth}>
        {left}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {right}
      </Box>
    </Box>
  );
}
