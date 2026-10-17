// Spinner — an animated loading indicator (braille frames) with an optional label.

import { useEffect, useState } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label, color = "cyan" }: { label?: string; color?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((x) => (x + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text color={color}>
      {FRAMES[i]}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
