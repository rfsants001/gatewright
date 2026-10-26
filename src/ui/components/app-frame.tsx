// AppFrame — the shared chrome for every sub-Home screen: a compact identity
// header, a separator, the screen's content, a separator, and a KeyHints footer.
// Home passes logoMode to show the full figlet wordmark instead of the compact
// header (and drops the top separator). Extracted from the cockpit's header/footer.

import { Box, Text } from "ink";
import type { ReactElement, ReactNode } from "react";
import { Icon } from "./icon.js";
import { Logo } from "./logo.js";
import { KeyHints, type KeyHint } from "./key-hints.js";
import { PRIMARY, DIM } from "../theme.js";

function version(): string {
  return process.env.npm_package_version ?? "0.x";
}

/** `◆ gatewright  0.x  ·  <breadcrumb>` — one line. */
export function CompactHeader({ breadcrumb }: { breadcrumb: string }): ReactElement {
  return (
    <Text>
      <Text color={PRIMARY}>
        <Icon name="gate" />
      </Text>
      <Text bold>{" gatewright"}</Text>
      <Text color={DIM}>{`  ${version()}`}</Text>
      {breadcrumb ? <Text color={DIM}>{`  ·  ${breadcrumb}`}</Text> : null}
    </Text>
  );
}

export interface AppFrameProps {
  breadcrumb: string;
  hints: KeyHint[];
  /** Home screen: full figlet wordmark instead of the compact header. */
  logoMode?: boolean;
  children: ReactNode;
}

export function AppFrame({ breadcrumb, hints, logoMode, children }: AppFrameProps): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      {logoMode ? <Logo /> : <CompactHeader breadcrumb={breadcrumb} />}
      {!logoMode ? <Text dimColor>{"─".repeat(48)}</Text> : null}
      <Box flexDirection="column">{children}</Box>
      <Text dimColor>{"─".repeat(48)}</Text>
      <KeyHints hints={hints} />
    </Box>
  );
}
