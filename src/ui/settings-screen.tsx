import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, TabBar, Badge, Icon, SelectList, type Choice } from "./components/index.js";
import { HINTS_BACK, HINTS_QUIT } from "./components/index.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore, type ConfigScope, type GatewrightConfig } from "../core/config/config-store.js";

const NONE = "(none / inherit)";

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
  const [engineIdx, setEngineIdx] = useState(0);

  const options: Choice<string>[] = [NONE, ...engineIds].map((e) => ({ value: e, label: e }));
  const current = scope === "gate" ? gate : project;
  const setCurrent = scope === "gate" ? setGate : setProject;
  const effective = store.resolve(cwd);

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (input === "b" || key.escape) return onBack();
  });

  const selectEngine = (val: string): void => {
    const patch = { defaultEngine: val === NONE ? undefined : val };
    const saved = store.write(scope, patch, cwd);
    setCurrent(saved);
  };

  const tabs = [
    { id: "gate", label: "Gate (global)" },
    { id: "project", label: "Project (this folder)" },
  ];

  const cfg = scope === "gate" ? gate : project;
  const packages = cfg.packages ?? [];

  return (
    <AppFrame breadcrumb="settings" hints={[...HINTS_BACK, ...HINTS_QUIT, { key: "tab/←→", label: "switch scope" }]}>
      <Text dimColor>Gate config applies everywhere · Project config overrides it for this folder.</Text>
      <Box marginTop={1}>
        <TabBar tabs={tabs} active={scope} onSwitch={(id) => setScope(id as ConfigScope)} />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Default engine</Text>
        <SelectList options={options} index={engineIdx} onMove={setEngineIdx} onSelect={selectEngine} />
        <Box marginTop={1} gap={1}>
          <Icon name="pass" color="green" />
          <Text>{`effective: `}</Text>
          <Badge label={effective.defaultEngine ?? "first installed"} color="green" />
        </Box>
      </Box>
      {packages.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Packages ({scope})</Text>
          {packages.map((p) => (
            <Box key={p.id} gap={1}>
              <Icon name="bullet" color="cyan" />
              <Text>{p.id}</Text>
              {p.version ? <Badge label={p.version} color="blue" dim /> : null}
            </Box>
          ))}
        </Box>
      )}
    </AppFrame>
  );
}
