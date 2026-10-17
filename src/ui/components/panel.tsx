// Panel — a titled, rounded-border box. The building block for every screen section.

import type { ReactNode } from "react";
import { Box, Text } from "ink";

export function Panel({ title, color = "cyan", children }: { title?: string; color?: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      {title ? <Text bold color={color}>{` ${title} `}</Text> : null}
      {children}
    </Box>
  );
}
