// TabBar — horizontal tabs with an active indicator. tab / shift+tab / ←→ switch.
// Used by Settings (scopes), Flow (step indicator) and the cockpit composer.

import { Box, Text, useInput } from "ink";
import type { ReactElement } from "react";
import { PRIMARY, DIM } from "../theme.js";

export interface TabItem {
  id: string;
  label: string;
  badge?: string;
}

export interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onSwitch: (id: string) => void;
  isActive?: boolean;
}

function step(tabs: TabItem[], active: string, delta: number): string {
  const i = tabs.findIndex((t) => t.id === active);
  if (i === -1) return active;
  const next = (i + delta + tabs.length) % tabs.length;
  return tabs[next]!.id;
}

export function TabBar({ tabs, active, onSwitch, isActive = true }: TabBarProps): ReactElement {
  useInput((_input, key) => {
    if (key.rightArrow || (key.tab && !key.shift)) onSwitch(step(tabs, active, 1));
    else if (key.leftArrow || (key.tab && key.shift)) onSwitch(step(tabs, active, -1));
  }, { isActive });

  return (
    <Box>
      {tabs.map((tab, i) => {
        const on = tab.id === active;
        return (
          <Text key={tab.id}>
            {i > 0 ? <Text color={DIM}>{"  ·  "}</Text> : null}
            <Text bold={on} color={on ? PRIMARY : DIM}>
              {on ? `▶ ${tab.label} ◀` : tab.label}
            </Text>
            {tab.badge ? <Text color={DIM}>{` ${tab.badge}`}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
