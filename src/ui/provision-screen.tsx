// ProvisionScreen — the gate installs/configures tools itself. Pick a known tool
// (Ollama pulls a model, LiteLLM via pip) or paste an install command; graphify has
// no shipped installer so it asks for one. Steps stream as a live log and success is
// recorded in the two-level config. The executor + probe are injectable for tests.

import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel, Icon, Spinner, SelectList, TextInputField } from "./components/index.js";
import { defaultCommandProbe, type CommandProbe } from "../core/env/probes.js";
import { CATALOG, customTool } from "../core/provision/catalog.js";
import { provision as defaultProvision } from "../core/provision/provisioner.js";
import type { ProvisionTool, StepOutcome } from "../core/provision/types.js";
import type { ConfigScope } from "../core/config/config-store.js";

const CUSTOM = "__custom__";
const AI = "__ai__";

export function ProvisionScreen({
  cwd,
  onBack,
  onQuit,
  onAiInstall,
  probe = defaultCommandProbe,
  run = defaultProvision,
}: {
  cwd: string;
  onBack: () => void;
  onQuit: () => void;
  /** Hand an "install from this repo/name" target to the AI-driven installer (a run). */
  onAiInstall?: (target: string) => void;
  probe?: CommandProbe;
  run?: typeof defaultProvision;
}) {
  const statuses = useMemo(() => CATALOG.map((t) => ({ tool: t, status: t.detect(probe) })), [probe]);
  const [phase, setPhase] = useState<"list" | "input" | "run">("list");
  const [idx, setIdx] = useState(0);
  const [tool, setTool] = useState<ProvisionTool | null>(null);
  const [asks, setAsks] = useState<"model" | "command" | "customcmd" | "ai">("model");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState<ConfigScope>("project");
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [done, setDone] = useState<boolean | null>(null);

  const start = (t: ProvisionTool, params: Record<string, string>): void => {
    setTool(t);
    setOutcomes([]);
    setDone(null);
    setPhase("run");
    void run(t, params, { cwd, onStep: (o) => setOutcomes((prev) => [...prev, o]) }).then((res) => setDone(res.ok));
  };

  const choose = (id: string): void => {
    if (id === AI) {
      setAsks("ai");
      setValue("");
      setPhase("input");
      return;
    }
    if (id === CUSTOM) {
      setAsks("customcmd");
      setValue("");
      setPhase("input");
      return;
    }
    const t = CATALOG.find((x) => x.id === id);
    if (!t) return;
    setTool(t);
    if (t.params?.length) {
      setAsks("model");
      setValue(t.params[0]!.default ?? "");
      setPhase("input");
    } else if (!t.buildSteps) {
      setAsks("command");
      setValue("");
      setPhase("input");
    } else {
      start(t, {});
    }
  };

  const submitInput = (): void => {
    if (asks === "model" && tool) start(tool, { [tool.params![0]!.key]: value.trim() || (tool.params![0]!.default ?? "") });
    else if (asks === "command" && tool && value.trim()) start(customTool(tool.id, value.trim(), tool.scope), {});
    else if (asks === "customcmd" && value.trim()) {
      const id = value.trim().split(/\s+/)[0]!.replace(/[^A-Za-z0-9._-]/g, "") || "package";
      start(customTool(id, value.trim(), scope), {});
    } else if (asks === "ai" && value.trim()) {
      onAiInstall?.(value.trim());
    }
  };

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (phase === "list" && (input === "b" || key.escape)) return onBack();
    if (phase === "input" && key.tab && asks === "customcmd") return setScope((s) => (s === "gate" ? "project" : "gate"));
    if (phase === "input" && key.escape) return setPhase("list");
    if (phase === "run" && done !== null && (input === "b" || key.return)) return setPhase("list");
  });

  if (phase === "input") {
    const label =
      asks === "model"
        ? `Model for ${tool?.name}`
        : asks === "command"
          ? `Install command for ${tool?.name}`
          : asks === "ai"
            ? "Repo URL or tool name — the AI reads it and installs"
            : "Install command (pasted)";
    const placeholder = asks === "model" ? "llama3.2" : asks === "ai" ? "https://github.com/owner/repo" : "e.g. npm i -g graphify";
    return (
      <Box flexDirection="column" paddingX={1}>
        <Logo />
        <Panel title={asks === "ai" ? "Install with AI" : "Install a package"} color="cyan">
          <TextInputField label={label} value={value} placeholder={placeholder} onChange={setValue} onSubmit={submitInput} />
          {asks === "ai" ? <Text dimColor>  the gate runs the engine to read the project and install + configure it</Text> : null}
          {asks === "customcmd" ? (
            <Text>
              <Icon name="bullet" color="cyan" />
              <Text>{` record in: `}</Text>
              <Text color="cyan" bold>{scope}</Text>
              <Text dimColor>{scope === "gate" ? "  (global — all projects)" : "  (this folder only)"}</Text>
            </Text>
          ) : null}
          <Text dimColor>{asks === "customcmd" ? "  enter run · tab toggle scope · esc back" : "  enter run · esc back"}</Text>
        </Panel>
      </Box>
    );
  }

  if (phase === "run") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Logo />
        <Panel title={`Installing ${tool?.name}`} color={done === null ? "cyan" : done ? "green" : "red"}>
          {outcomes.map((o, i) => (
            <Text key={i}>
              <Icon name={o.ok ? "ok" : "bad"} color={o.ok ? "green" : "red"} />
              <Text>{` ${o.step.label}`}</Text>
              {o.output ? <Text dimColor>{`  ${o.output.replace(/\s+/g, " ").slice(0, 80)}`}</Text> : null}
            </Text>
          ))}
          {done === null ? <Spinner label="working…" /> : <Text color={done ? "green" : "red"}>{done ? "✓ installed + recorded in config" : "✗ failed — see output above"}</Text>}
          {done !== null ? <Text dimColor>  b — back</Text> : null}
        </Panel>
      </Box>
    );
  }

  const options = [
    ...statuses.map(({ tool: t, status }) => ({ value: t.id, label: `${status.installed ? "● " : "○ "}${t.name}`, hint: status.installed ? "installed" : t.description })),
    { value: AI, label: "✨ Install with AI…", hint: "paste a repo URL/name — the AI installs it" },
    { value: CUSTOM, label: "＋ Custom package…", hint: "paste an install command" },
  ];
  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Install / provision tools" color="cyan">
        <Text dimColor>The gate installs + configures these for you, and records them per scope.</Text>
        <SelectList options={options} index={idx} onMove={setIdx} onSelect={choose} />
        <Text dimColor>  ↑↓ move · enter select · b back · q quit</Text>
      </Panel>
    </Box>
  );
}
