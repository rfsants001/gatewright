// Session tabs — 3-col vertical rail on the far left. Per-tab state spinner/●/○.
// ctrl+1..9 switch; ctrl+n new.

import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import type { Session } from "../../core/run/session-store.js";

export interface SessionTabsProps {
  sessions: Session[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onNew: () => void;
}

function stateGlyph(state: Session["state"]): string {
  switch (state) {
    case "RUNNING": return "⟳";
    case "PASSED": return "●";
    case "FAILED": return "✗";
    case "PAUSED": return "⏸";
    default: return "○";
  }
}

function stateColor(state: Session["state"]): string | undefined {
  switch (state) {
    case "RUNNING": return "cyan";
    case "PASSED": return "green";
    case "FAILED": return "red";
    case "PAUSED": return "yellow";
    default: return undefined;
  }
}

export function SessionTabs({ sessions, activeId, onActivate, onNew }: SessionTabsProps): ReactElement {
  useInput((input, key) => {
    if (key.ctrl && input === "n") {
      onNew();
      return;
    }
    if (key.ctrl && input >= "1" && input <= "9") {
      const idx = parseInt(input, 10) - 1;
      const session = sessions[idx];
      if (session) onActivate(session.id);
    }
  });

  return (
    <Box flexDirection="column" width={3}>
      {sessions.map((s, i) => {
        const active = s.id === activeId;
        const glyph = stateGlyph(s.state);
        const color = stateColor(s.state);
        const colorProp = color ? { color } : {};
        return (
          <Box key={s.id} flexDirection="column">
            <Text {...(active ? { bold: true } : {})} {...colorProp}>
              {active ? "▸" : " "}
            </Text>
            <Text {...colorProp} dimColor={!active}>{glyph}</Text>
            <Text dimColor>{String(i + 1)}</Text>
          </Box>
        );
      })}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>+</Text>
        <Text dimColor>n</Text>
      </Box>
    </Box>
  );
}
