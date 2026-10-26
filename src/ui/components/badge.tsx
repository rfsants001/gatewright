// Badge — an inline colored pill: [PASSED], [RUNNING], [gate]. Used for run state,
// gate state, review kind (History), tool status (Provision).

import { Text } from "ink";
import type { ReactElement } from "react";

export interface BadgeProps {
  label: string;
  color: string;
  dim?: boolean;
}

export function Badge({ label, color, dim }: BadgeProps): ReactElement {
  const props: { color: string; dimColor?: boolean } = { color };
  if (dim) props.dimColor = true;
  return <Text {...props}>{`[${label}]`}</Text>;
}
