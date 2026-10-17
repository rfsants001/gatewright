// Component gallery — a visual showcase of the kit. Run with `gate ui` to eyeball
// borders, icons, radio, progress and the menu in your actual terminal.

import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { Panel } from "./panel.js";
import { Icon } from "./icon.js";
import { ProgressBar } from "./progress-bar.js";
import { TextInputField } from "./text-input-field.js";
import { RadioGroup, type Choice } from "./radio-group.js";
import { SelectList } from "./select-list.js";
import { Button } from "./button.js";

const MENU: Choice<"doctor" | "init" | "exit">[] = [
  { value: "doctor", label: "Doctor", hint: "status board" },
  { value: "init", label: "Configure", hint: "wizard" },
  { value: "exit", label: "Exit" },
];

export function Gallery() {
  const { exit } = useApp();
  const [pct, setPct] = useState(0.1);
  const [index, setIndex] = useState(0);

  useInput((input) => {
    if (input === "q") exit();
  });

  useEffect(() => {
    const timer = setInterval(() => setPct((p) => (p >= 1 ? 0 : Number((p + 0.07).toFixed(2)))), 160);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Text bold color="cyan">{" gatewright · component gallery "}</Text>

      <Panel title="Icons">
        <Box gap={2}>
          <Text>
            <Icon name="ok" color="green" /> ok
          </Text>
          <Text>
            <Icon name="warn" color="yellow" /> warn
          </Text>
          <Text>
            <Icon name="bad" color="red" /> missing
          </Text>
          <Text>
            <Icon name="info" color="blue" /> info
          </Text>
        </Box>
      </Panel>

      <Panel title="Text input (bordered + placeholder)">
        <TextInputField label="Model" value="qwen2.5" placeholder="model name" focus={false} onChange={() => {}} />
      </Panel>

      <Panel title="Radio (single choice)">
        <RadioGroup
          value="claude"
          isFocused={false}
          onChange={() => {}}
          options={[
            { value: "claude", label: "Claude Code" },
            { value: "codex", label: "Codex" },
            { value: "copilot", label: "Copilot" },
          ]}
        />
      </Panel>

      <Panel title="Progress">
        <ProgressBar value={pct} width={28} label="Setup" />
      </Panel>

      <Panel title="Buttons">
        <Box gap={2}>
          <Button label="Apply" focused onPress={() => {}} />
          <Button label="Cancel" onPress={() => {}} />
        </Box>
      </Panel>

      <Panel title="Menu  (↑ ↓ to move · q to quit)">
        <SelectList options={MENU} index={index} onMove={setIndex} onSelect={(v) => (v === "exit" ? exit() : undefined)} />
      </Panel>
    </Box>
  );
}

export async function runGallery(): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write("gate ui: the interactive gallery needs a terminal (TTY).\n");
    return 1;
  }
  const { waitUntilExit } = render(<Gallery />);
  await waitUntilExit();
  return 0;
}
