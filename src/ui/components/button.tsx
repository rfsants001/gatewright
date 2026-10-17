// Button — a bordered, focusable button. Highlighted when focused; Enter triggers.

import { Box, Text, useInput } from "ink";

export function Button({ label, focused = false, onPress }: { label: string; focused?: boolean; onPress: () => void }) {
  useInput(
    (_input, key) => {
      if (key.return) onPress();
    },
    { isActive: focused },
  );

  return (
    <Box borderStyle="round" borderColor={focused ? "cyan" : "gray"} paddingX={2}>
      <Text {...(focused ? { color: "cyan" } : {})} bold={focused}>
        {label}
      </Text>
    </Box>
  );
}
