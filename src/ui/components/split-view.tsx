// SplitView — responsive two-column layout. In compact mode it stacks vertically
// (left above right); normal/wide render side-by-side. Used by Dashboard.

import { Box } from "ink";
import type { ReactElement, ReactNode } from "react";
import type { TerminalMode } from "../hooks/use-terminal-size.js";

export interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: string;
  mode: TerminalMode;
}

export function SplitView({ left, right, leftWidth = "52%", mode }: SplitViewProps): ReactElement {
  if (mode === "compact") {
    return (
      <Box flexDirection="column">
        <Box flexDirection="column">{left}</Box>
        <Box flexDirection="column">{right}</Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width={leftWidth}>{left}</Box>
      <Box flexDirection="column" flexGrow={1}>{right}</Box>
    </Box>
  );
}
