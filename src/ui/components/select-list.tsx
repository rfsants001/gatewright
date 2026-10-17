// SelectList — a vertical menu with a pointer and arrow-key navigation; Enter
// confirms. The backbone of the home screen.

import { Box, Text, useInput } from "ink";
import { Icon } from "./icon.js";
import type { Choice } from "./radio-group.js";

export function SelectList<T extends string>({
  options,
  index,
  onMove,
  onSelect,
  isFocused = true,
}: {
  options: Choice<T>[];
  index: number;
  onMove: (index: number) => void;
  onSelect: (value: T) => void;
  isFocused?: boolean;
}) {
  useInput(
    (_input, key) => {
      if (key.upArrow) onMove((index - 1 + options.length) % options.length);
      else if (key.downArrow) onMove((index + 1) % options.length);
      else if (key.return) onSelect((options[index] as Choice<T>).value);
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      {options.map((o, i) => {
        const active = i === index;
        return (
          <Box key={o.value}>
            {active ? <Icon name="pointer" color="cyan" /> : <Text> </Text>}
            <Text {...(active ? { color: "cyan" } : {})} bold={active}>{` ${o.label}`}</Text>
            {o.hint ? <Text dimColor>{`  ${o.hint}`}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
