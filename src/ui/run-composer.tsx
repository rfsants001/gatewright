// RunComposer — the cockpit's compose screen: write a prompt, pick an engine,
// attach context dirs, hit Run. Only installed + supported engines are selectable;
// the rest show why they're unavailable. The assembled EngineRunOptions is handed
// up via onRun — this component owns no process logic.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel, Icon, TextInputField } from "./components/index.js";
import type { EngineRunOptions } from "../core/engine/types.js";

/** A UI-ready view of one engine (app.tsx maps DetectedEngine → this). */
export interface ComposerEngine {
  id: string;
  name: string;
  installed: boolean;
  supported: boolean;
  /** inherited-cli engine with no login detected — run won't authenticate. */
  loggedOut?: boolean;
  detail?: string;
}

type Field = "prompt" | "engine" | "context" | "run";
const ORDER: Field[] = ["prompt", "engine", "context", "run"];

/** Pure: assemble run options from the form + run context. Exported for tests. */
export function buildRunOptions(
  prompt: string,
  engineId: string,
  contextInput: string,
  ctx: { cwd: string; mcpConfigPath: string },
): { engineId: string; options: EngineRunOptions } {
  const contextDirs = contextInput.split(/[\s,]+/).filter(Boolean);
  return {
    engineId,
    options: {
      prompt: prompt.trim(),
      cwd: ctx.cwd,
      mcpConfigPath: ctx.mcpConfigPath,
      ...(contextDirs.length ? { contextDirs } : {}),
    },
  };
}

export function RunComposer({
  engines,
  cwd,
  mcpConfigPath,
  onRun,
  onBack,
  onQuit,
}: {
  engines: ComposerEngine[];
  cwd: string;
  mcpConfigPath: string;
  onRun: (engineId: string, options: EngineRunOptions) => void;
  onBack: () => void;
  onQuit: () => void;
}) {
  const selectable = engines.filter((e) => e.installed && e.supported);
  const [field, setField] = useState<Field>("prompt");
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [engineId, setEngineId] = useState(selectable[0]?.id ?? "");

  const selected = engines.find((e) => e.id === engineId);
  const canRun = prompt.trim().length > 0 && engineId.length > 0;
  const submit = (): void => {
    if (!canRun) return;
    const { options } = buildRunOptions(prompt, engineId, context, { cwd, mcpConfigPath });
    onRun(engineId, options);
  };
  const advance = (dir: 1 | -1): void => {
    setField((f) => ORDER[(ORDER.indexOf(f) + dir + ORDER.length) % ORDER.length]!);
  };

  useInput((input, key) => {
    if (input === "q" && field !== "prompt" && field !== "context") return onQuit();
    if (key.escape) return onBack();
    if (key.tab) return advance(key.shift ? -1 : 1);
    if (field === "engine" && selectable.length > 0) {
      const i = Math.max(0, selectable.findIndex((e) => e.id === engineId));
      if (key.upArrow) setEngineId(selectable[(i - 1 + selectable.length) % selectable.length]!.id);
      else if (key.downArrow) setEngineId(selectable[(i + 1) % selectable.length]!.id);
    }
    if (field === "run" && key.return) submit();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Run an agent through the gate" color="cyan">
        <Text dimColor>The gate drives the engine headlessly — every tool call passes the gates + Jev.</Text>

        <Box marginTop={1}>
          <TextInputField
            label="Prompt"
            value={prompt}
            placeholder="what should the agent do?"
            focus={field === "prompt"}
            onChange={setPrompt}
            onSubmit={() => advance(1)}
          />
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold {...(field === "engine" ? { color: "cyan" } : {})}>Engine</Text>
          {engines.map((e) => {
            const active = e.id === engineId;
            const usable = e.installed && e.supported;
            const why = !e.installed ? "not installed" : !e.supported ? "detected — not yet supported" : e.detail;
            return (
              <Box key={e.id}>
                <Icon name={active && usable ? "radioOn" : "radioOff"} color={active && usable ? "cyan" : "gray"} />
                <Text dimColor={!usable} {...(active && usable ? { color: "cyan" } : {})}>{` ${e.name}`}</Text>
                {!usable && why ? <Text dimColor>{`  — ${why}`}</Text> : null}
              </Box>
            );
          })}
        </Box>

        {selected?.loggedOut ? (
          <Box marginTop={1}>
            <Icon name="warn" color="yellow" />
            <Text color="yellow">{` ${selected.name} has no login — run \`claude\` once to authenticate, then try again`}</Text>
          </Box>
        ) : null}

        <Box marginTop={1}>
          <TextInputField
            label="Context dirs (optional, space-separated)"
            value={context}
            placeholder="e.g. src docs"
            focus={field === "context"}
            onChange={setContext}
            onSubmit={() => advance(1)}
          />
        </Box>

        <Box marginTop={1}>
          <Icon name="pointer" color={field === "run" ? (canRun ? "green" : "gray") : "gray"} />
          <Text {...(field === "run" ? { color: canRun ? "green" : "gray" } : {})} bold={field === "run"}>
            {canRun ? " Run" : " Run (write a prompt first)"}
          </Text>
        </Box>

        <Text dimColor>  tab next field · ↑↓ pick engine · enter on Run · esc back</Text>
      </Panel>
    </Box>
  );
}
