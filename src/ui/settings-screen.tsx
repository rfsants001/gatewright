// SettingsScreen — surfaces the two config scopes. Tab flips between Gate (global,
// applies everywhere) and Project (this folder, overrides the gate). You pick the
// default engine for the focused scope; the effective value (what a run actually
// uses) is shown so the override is legible. Provisioned packages are listed per scope.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Icon, AppFrame, TabBar, HINTS_BACK, HINTS_QUIT } from "./components/index.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore, type ConfigScope, type GatewrightConfig } from "../core/config/config-store.js";
import { SUCCESS } from "./theme.js";

const NONE = "(none)";

export function SettingsScreen({
  cwd,
  engineIds,
  onBack,
  onQuit,
  store = new ConfigStore(new FileArtifactStore()),
}: {
  cwd: string;
  engineIds: string[];
  onBack: () => void;
  onQuit: () => void;
  store?: ConfigStore;
}) {
  const [scope, setScope] = useState<ConfigScope>("project");
  const [gate, setGate] = useState<GatewrightConfig>(() => store.read("gate", cwd));
  const [project, setProject] = useState<GatewrightConfig>(() => store.read("project", cwd));

  const options = [NONE, ...engineIds];
  const current = scope === "gate" ? gate : project;
  const setCurrent = scope === "gate" ? setGate : setProject;
  const effective = store.resolve(cwd);

  const cycle = (dir: 1 | -1): void => {
    const now = current.defaultEngine ?? NONE;
    const i = Math.max(0, options.indexOf(now));
    const nextVal = options[(i + dir + options.length) % options.length]!;
    const patch = { defaultEngine: nextVal === NONE ? undefined : nextVal };
    const saved = store.write(scope, patch, cwd);
    setCurrent(saved);
  };

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (input === "b" || key.escape) return onBack();
    if (key.tab) return setScope((s) => (s === "gate" ? "project" : "gate"));
    if (key.leftArrow || key.upArrow) return cycle(-1);
    if (key.rightArrow || key.downArrow) return cycle(1);
  });

  const scopeLine = (label: string, cfg: GatewrightConfig, active: boolean) => (
    <Box flexDirection="column">
      <Text {...(active ? { color: "cyan" } : {})} bold={active}>
        {active ? "❯ " : "  "}
        {label}
      </Text>
      <Text dimColor>{`    default engine: ${cfg.defaultEngine ?? "—"}`}</Text>
      <Text dimColor>{`    packages: ${cfg.packages?.map((p) => p.id).join(", ") || "none"}`}</Text>
    </Box>
  );

  return (
    <AppFrame
      breadcrumb="settings"
      hints={[{ key: "tab", label: "scope" }, { key: "←→", label: "engine" }, HINTS_BACK[0]!, ...HINTS_QUIT]}
    >
      <Text dimColor>Gate config applies everywhere; Project config overrides it for this folder.</Text>
      <Box marginY={1}>
        <TabBar
          tabs={[{ id: "gate", label: "Gate" }, { id: "project", label: "Project (this folder)" }]}
          active={scope}
          onSwitch={(id) => setScope(id as ConfigScope)}
          isActive={false}
        />
      </Box>
      {scopeLine("Gate (global)", gate, scope === "gate")}
      {scopeLine("Project (this folder)", project, scope === "project")}
      <Box marginTop={1}>
        <Icon name="bullet" color={SUCCESS} />
        <Text>{` effective default engine: ${effective.defaultEngine ?? "(first installed)"}`}</Text>
      </Box>
    </AppFrame>
  );
}
