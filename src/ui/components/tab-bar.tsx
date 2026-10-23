import { Box, Text, useInput } from "ink";

export interface Tab {
  id: string;
  label: string;
  badge?: string | undefined;
}

export function TabBar({
  tabs,
  active,
  onSwitch,
  isFocused = true,
}: {
  tabs: Tab[];
  active: string;
  onSwitch: (id: string) => void;
  isFocused?: boolean;
}) {
  useInput(
    (_input, key) => {
      const i = tabs.findIndex((t) => t.id === active);
      if (key.tab && !key.shift) onSwitch(tabs[(i + 1) % tabs.length]!.id);
      else if (key.tab && key.shift) onSwitch(tabs[(i - 1 + tabs.length) % tabs.length]!.id);
      else if (key.rightArrow) onSwitch(tabs[(i + 1) % tabs.length]!.id);
      else if (key.leftArrow) onSwitch(tabs[(i - 1 + tabs.length) % tabs.length]!.id);
    },
    { isActive: isFocused },
  );

  return (
    <Box>
      <Text>{"  "}</Text>
      {tabs.map((t, i) => {
        const isActive = t.id === active;
        const suffix = t.badge ? ` [${t.badge}]` : "";
        return (
          <Box key={t.id}>
            {i > 0 ? <Text dimColor>{"  ·  "}</Text> : null}
            {isActive ? (
              <Text color="cyan" bold>{`▶ ${t.label}${suffix} ◀`}</Text>
            ) : (
              <Text dimColor>{`${t.label}${suffix}`}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
