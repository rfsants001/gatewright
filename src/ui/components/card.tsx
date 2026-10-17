// Card — a small bordered box with a bold title and an optional truncated
// description. Used to present skills/commands compactly in grids.

import { Box, Text } from "ink";

export function Card({ title, description, color = "gray", width }: { title: string; description?: string; color?: string; width?: number | string }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} flexDirection="column" {...(width !== undefined ? { width } : {})}>
      <Text bold>{title}</Text>
      {description ? (
        <Text dimColor wrap="truncate-end">
          {description}
        </Text>
      ) : null}
    </Box>
  );
}
