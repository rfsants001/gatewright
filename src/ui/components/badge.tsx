import { Text } from "ink";

export function Badge({ label, color, dim }: { label: string; color: string; dim?: boolean }) {
  return (
    <Text {...(dim ? {} : { color })} dimColor={dim === true}>
      {`[${label}]`}
    </Text>
  );
}
