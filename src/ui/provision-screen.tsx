import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Badge, Icon, Spinner, ScrollableList, SelectList, TextInputField } from "./components/index.js";
import { HINTS_BACK, HINTS_QUIT, HINTS_NAV, type Choice } from "./components/index.js";
import { defaultCommandProbe, type CommandProbe } from "../core/env/probes.js";
import { CATALOG, customTool } from "../core/provision/catalog.js";
import { provision as defaultProvision } from "../core/provision/provisioner.js";
import type { ProvisionTool, StepOutcome } from "../core/provision/types.js";
import type { ConfigScope } from "../core/config/config-store.js";

const CUSTOM = "__custom__";
const AI = "__ai__";

interface ListItem {
  id: string;
  label: string;
  hint?: string | undefined;
  installed?: boolean | undefined;
}

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
  onAiInstall?: (target: string) => void;
  probe?: CommandProbe;
  run?: typeof defaultProvision;
}) {
  const statuses = useMemo(() => CATALOG.map((t) => ({ tool: t, status: t.detect(probe) })), [probe]);
  const [phase, setPhase] = useState<"list" | "input" | "run">("list");
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
    if (id === AI) { setAsks("ai"); setValue(""); setPhase("input"); return; }
    if (id === CUSTOM) { setAsks("customcmd"); setValue(""); setPhase("input"); return; }
    const t = CATALOG.find((x) => x.id === id);
    if (!t) return;
    setTool(t);
    if (t.params?.length) {
      setAsks("model"); setValue(t.params[0]!.default ?? ""); setPhase("input");
    } else if (!t.buildSteps) {
      setAsks("command"); setValue(""); setPhase("input");
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
      asks === "model" ? `Model for ${tool?.name}`
      : asks === "command" ? `Install command for ${tool?.name}`
      : asks === "ai" ? "Repo URL or tool name — the AI reads it and installs"
      : "Install command (pasted)";
    const placeholder =
      asks === "model" ? "llama3.2"
      : asks === "ai" ? "https://github.com/owner/repo"
      : "e.g. npm i -g graphify";
    return (
      <AppFrame
        breadcrumb={asks === "ai" ? "provision · AI install" : "provision · install"}
        hints={[{ key: "enter", label: "run" }, ...HINTS_BACK]}
      >
        <TextInputField label={label} value={value} placeholder={placeholder} onChange={setValue} onSubmit={submitInput} />
        {asks === "ai" && <Text dimColor>  the gate runs the engine to read the project and install + configure it</Text>}
        {asks === "customcmd" && (
          <Box gap={1} marginTop={1}>
            <Text>record in:</Text>
            <Badge label={scope} color="cyan" />
            <Text dimColor>{scope === "gate" ? "(global — all projects)" : "(this folder only)  tab to switch"}</Text>
          </Box>
        )}
      </AppFrame>
    );
  }

  if (phase === "run") {
    const runColor = done === null ? "cyan" : done ? "green" : "red";
    return (
      <AppFrame
        breadcrumb={`provision · ${tool?.name ?? "…"}`}
        hints={done !== null ? [...HINTS_BACK] : []}
      >
        {outcomes.map((o, i) => (
          <Box key={i} gap={1}>
            <Icon name={o.ok ? "pass" : "fail"} color={o.ok ? "green" : "red"} />
            <Text>{o.step.label}</Text>
            {o.output ? <Text dimColor>{o.output.replace(/\s+/g, " ").slice(0, 80)}</Text> : null}
          </Box>
        ))}
        {done === null ? (
          <Spinner label="working…" />
        ) : (
          <Box gap={1} marginTop={1}>
            <Badge label={done ? "done" : "failed"} color={runColor} />
            <Text color={runColor}>{done ? "installed + recorded in config" : "see output above"}</Text>
          </Box>
        )}
      </AppFrame>
    );
  }

  const items: ListItem[] = [
    ...statuses.map(({ tool: t, status }) => ({
      id: t.id,
      label: t.name,
      hint: status.installed ? undefined : t.description,
      installed: status.installed,
    })),
    { id: AI, label: "✨ Install with AI…", hint: "paste a repo URL/name — the AI installs it" },
    { id: CUSTOM, label: "+ Custom package…", hint: "paste an install command" },
  ];

  return (
    <AppFrame breadcrumb="provision" hints={[...HINTS_NAV, ...HINTS_BACK, ...HINTS_QUIT]}>
      <Text dimColor>The gate installs + configures these for you, and records them per scope.</Text>
      <Box marginTop={1}>
        <ScrollableList
          items={items}
          onSelect={(item) => choose(item.id)}
          renderItem={(item, active) => (
            <Box gap={1}>
              <Text {...(active ? { color: "cyan" as const } : {})}>{active ? "▶" : " "}</Text>
              <Text {...(active ? { color: "cyan" as const } : {})} bold={active}>{item.label}</Text>
              {item.installed !== undefined && (
                <Badge
                  label={item.installed ? "installed" : "not found"}
                  color={item.installed ? "green" : "gray"}
                  dim={!item.installed}
                />
              )}
              {item.hint && <Text dimColor>{item.hint}</Text>}
            </Box>
          )}
        />
      </Box>
    </AppFrame>
  );
}
