import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Icon, TextInputField, Badge } from "./components/index.js";
import { HINTS_BACK, HINTS_QUIT } from "./components/index.js";
import type { EngineRunOptions } from "../core/engine/types.js";

export interface ComposerEngine {
  id: string;
  name: string;
  installed: boolean;
  supported: boolean;
  loggedOut?: boolean;
  detail?: string;
}

type Field = "prompt" | "engine" | "context" | "run";
const ORDER: Field[] = ["prompt", "engine", "context", "run"];

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

function charCountColor(len: number): string {
  if (len > 8000) return "red";
  if (len > 2000) return "yellow";
  return "gray";
}

export function RunComposer({
  engines,
  cwd,
  mcpConfigPath,
  preferredEngineId,
  onRun,
  onBack,
  onQuit,
}: {
  engines: ComposerEngine[];
  cwd: string;
  mcpConfigPath: string;
  preferredEngineId?: string;
  onRun: (engineId: string, options: EngineRunOptions) => void;
  onBack: () => void;
  onQuit: () => void;
}) {
  const selectable = engines.filter((e) => e.installed && e.supported);
  const preferred = selectable.find((e) => e.id === preferredEngineId)?.id;
  const [field, setField] = useState<Field>("prompt");
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [engineId, setEngineId] = useState(preferred ?? selectable[0]?.id ?? "");

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

  const charCount = prompt.length;

  return (
    <AppFrame
      breadcrumb="run"
      hints={[
        { key: "tab", label: "next field" },
        { key: "↑↓", label: "engine" },
        { key: "enter on Run", label: "start" },
        ...HINTS_BACK,
      ]}
    >
      <Text dimColor>The gate drives the engine headlessly — every tool call passes the gates + Jev.</Text>

      <Box marginTop={1} flexDirection="column">
        <TextInputField
          label="Prompt"
          value={prompt}
          placeholder="what should the agent do?"
          focus={field === "prompt"}
          onChange={setPrompt}
          onSubmit={() => advance(1)}
        />
        {charCount > 0 && (
          <Text color={charCountColor(charCount)} dimColor={charCount <= 2000}>{`  ${charCount} chars`}</Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold {...(field === "engine" ? { color: "cyan" } : {})}>Engine</Text>
        {engines.map((e) => {
          const active = e.id === engineId;
          const usable = e.installed && e.supported;
          const why = !e.installed ? "not installed" : !e.supported ? "detected — not yet supported" : e.detail;
          return (
            <Box key={e.id} gap={1}>
              <Icon name={active && usable ? "radioOn" : "radioOff"} color={active && usable ? "cyan" : "gray"} />
              <Text dimColor={!usable} {...(active && usable ? { color: "cyan" } : {})}>{e.name}</Text>
              {!usable && why ? <Badge label={why} color="gray" dim /> : null}
            </Box>
          );
        })}
      </Box>

      {selected?.loggedOut ? (
        <Box marginTop={1} gap={1}>
          <Icon name="warn" color="yellow" />
          <Text color="yellow">{`${selected.name} has no login — run \`claude\` once to authenticate`}</Text>
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

      <Box
        marginTop={1}
        {...(field === "run" && canRun ? { borderStyle: "round" as const, borderColor: "green" } : {})}
        paddingX={field === "run" && canRun ? 1 : 0}
      >
        <Icon name={field === "run" ? (canRun ? "run" : "locked") : "sep"} color={field === "run" ? (canRun ? "green" : "gray") : "gray"} />
        <Text {...(field === "run" ? { color: canRun ? "green" : "gray" } : {})} bold={field === "run"}>
          {canRun ? " Run" : " Run (write a prompt first)"}
        </Text>
      </Box>
    </AppFrame>
  );
}
