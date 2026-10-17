// CheckboxGroup — multi-select list. ↑/↓ move the cursor, space toggles, enter
// submits. Controlled (selected set + onToggle) so pages own the state.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Icon } from "./icon.js";
import type { Choice } from "./radio-group.js";

export function CheckboxGroup<T extends string>({
  label,
  options,
  selected,
  onToggle,
  onSubmit,
  isFocused = true,
}: {
  label?: string;
  options: Choice<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  onSubmit: () => void;
  isFocused?: boolean;
}) {
  const [cursor, setCursor] = useState(0);

  useInput(
    (input, key) => {
      if (key.upArrow) setCursor((c) => (c - 1 + options.length) % options.length);
      else if (key.downArrow) setCursor((c) => (c + 1) % options.length);
      else if (input === " ") onToggle((options[cursor] as Choice<T>).value);
      else if (key.return) onSubmit();
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      {label ? <Text bold>{label}</Text> : null}
      {options.map((o, i) => {
        const on = selected.includes(o.value);
        const active = i === cursor;
        return (
          <Box key={o.value}>
            <Icon name={on ? "checkOn" : "checkOff"} color={on ? "green" : "gray"} />
            <Text {...(active ? { color: "cyan" } : {})}>{` ${o.label}`}</Text>
            {o.hint ? <Text dimColor>{`  ${o.hint}`}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
