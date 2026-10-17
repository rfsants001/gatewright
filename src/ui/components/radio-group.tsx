// RadioGroup — single-choice list with ◉/○ markers, arrow-key navigation.

import { Box, Text, useInput } from "ink";
import { Icon } from "./icon.js";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  onSubmit,
  isFocused = true,
}: {
  label?: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  onSubmit?: (value: T) => void;
  isFocused?: boolean;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  useInput(
    (_input, key) => {
      if (key.upArrow) onChange((options[(index - 1 + options.length) % options.length] as Choice<T>).value);
      else if (key.downArrow) onChange((options[(index + 1) % options.length] as Choice<T>).value);
      else if (key.return && onSubmit) onSubmit((options[index] as Choice<T>).value);
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column">
      {label ? <Text bold>{label}</Text> : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Box key={o.value}>
            <Icon name={selected ? "radioOn" : "radioOff"} color={selected ? "cyan" : "gray"} />
            <Text {...(selected ? { color: "cyan" } : {})}>{` ${o.label}`}</Text>
            {o.hint ? <Text dimColor>{`  ${o.hint}`}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
