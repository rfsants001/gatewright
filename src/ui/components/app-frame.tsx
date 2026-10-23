import type { ReactNode } from "react";
import { Box, Text } from "ink";
import { Logo } from "./logo.js";
import { KeyHints, type KeyHint } from "./key-hints.js";

export function AppFrame({
  breadcrumb,
  hints,
  logoMode = false,
  children,
}: {
  breadcrumb: string;
  hints: KeyHint[];
  logoMode?: boolean;
  children: ReactNode;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {logoMode ? (
        <Logo />
      ) : (
        <Box marginBottom={1}>
          <Text color="cyan">◆</Text>
          <Text bold> gatewright</Text>
          <Text dimColor>{`  ·  ${breadcrumb}`}</Text>
        </Box>
      )}
      <Box flexDirection="column">{children}</Box>
      <KeyHints hints={hints} />
    </Box>
  );
}
