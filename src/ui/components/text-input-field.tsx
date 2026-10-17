// TextInputField — a labelled text input inside a rounded border, with placeholder.
// Wraps ink-text-input for the actual editing (cursor, backspace, submit).

import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export function TextInputField({
  label,
  value,
  placeholder,
  focus = true,
  onChange,
  onSubmit,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  focus?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}) {
  return (
    <Box flexDirection="column">
      {label ? <Text bold>{label}</Text> : null}
      <Box borderStyle="round" borderColor={focus ? "cyan" : "gray"} paddingX={1}>
        <TextInput
          value={value}
          onChange={onChange}
          focus={focus}
          {...(onSubmit ? { onSubmit } : {})}
          {...(placeholder !== undefined ? { placeholder } : {})}
        />
      </Box>
    </Box>
  );
}
