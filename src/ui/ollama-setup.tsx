// Jev local-AI setup — check Ollama, guide installation if missing, let the user
// pick a model, and (optionally) drop an AI-helper doc the main agent can follow.

import { useEffect, useState } from "react";
import { homedir } from "node:os";
import { Box, Text, useInput } from "ink";
import { Icon, Spinner, Panel, RadioGroup } from "./components/index.js";
import { detectOllama, writeOllamaHelper, type OllamaStatus } from "../core/jev/ollama.js";
import { detectHardware, type Hardware } from "../core/env/hardware.js";
import { rankModels, type FitCategory, type RankedModel } from "../core/jev/model-catalog.js";

const short = (p: string): string => p.replace(homedir(), "~");

function fitMark(category: FitCategory) {
  if (category === "recommended") return <Icon name="ok" color="green" />;
  if (category === "runs") return <Icon name="warn" color="yellow" />;
  return <Icon name="bad" color="red" />;
}

function RecommendedModels({ hw, ranked }: { hw: Hardware; ranked: RankedModel[] }) {
  const show = ranked.filter((m) => m.category !== "too-big").slice(0, 6);
  return (
    <Box flexDirection="column">
      <Text dimColor>{`  Your machine: ${hw.totalRamGB} GB RAM · ${hw.cpuCount} CPU${hw.gpu ? ` · GPU ${hw.gpu.name}${hw.gpu.vramGB ? ` ${hw.gpu.vramGB}GB` : ""}` : ""}`}</Text>
      <Text bold>Recommended models (best fit first)</Text>
      {show.map((m) => (
        <Text key={m.tag}>
          {"  "}
          {fitMark(m.category)} {m.tag}
          <Text dimColor>{`  ~${m.minRamGB} GB · ollama pull ${m.tag}`}</Text>
        </Text>
      ))}
    </Box>
  );
}

export function OllamaSetup({ onUse, onSkip, onBack, onQuit }: { onUse: (model: string) => void; onSkip: () => void; onBack: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const [status, setStatus] = useState<"detecting" | OllamaStatus>("detecting");
  const [model, setModel] = useState("");
  const [note, setNote] = useState("");
  const [hw, setHw] = useState<Hardware | null>(null);
  const [ranked, setRanked] = useState<RankedModel[]>([]);

  const check = (): void => {
    setStatus("detecting");
    void detectOllama().then((s) => {
      setStatus(s);
      if (s.models[0]) setModel(s.models[0]);
    });
  };
  useEffect(() => check(), []);
  useEffect(() => {
    const h = detectHardware();
    setHw(h);
    setRanked(rankModels(h));
  }, []);

  const topPick = ranked.find((m) => m.category === "recommended")?.tag ?? "qwen2.5";

  const hasModels = status !== "detecting" && status.reachable && status.models.length > 0;

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onBack();
    else if (input === "s") onSkip();
    else if (input === "r") check();
    else if (input === "w") {
      const p = writeOllamaHelper(cwd, model || topPick);
      setNote(`wrote ${short(p)} — open it with your agent to finish setup`);
    }
  });

  if (status === "detecting") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">{" Jev · local AI setup "}</Text>
        <Spinner label="checking Ollama…" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Panel title="Jev · local AI setup" color="cyan">
        <Text dimColor>Jev needs a local Ollama model. It stays advisory — it never blocks.</Text>
        {!status.reachable ? (
          <>
            <Text>
              <Icon name="bad" color="red" /> Ollama not reachable at http://localhost:11434
            </Text>
            <Text dimColor>  Install:  curl -fsSL https://ollama.com/install.sh | sh</Text>
            {hw ? <RecommendedModels hw={hw} ranked={ranked} /> : null}
          </>
        ) : !hasModels ? (
          <>
            <Text>
              <Icon name="warn" color="yellow" /> Ollama is running, but has no models
            </Text>
            {hw ? <RecommendedModels hw={hw} ranked={ranked} /> : null}
          </>
        ) : (
          <>
            <Text>
              <Icon name="ok" color="green" /> {`Ollama running · ${status.models.length} model(s)`}
            </Text>
            <RadioGroup label="Pick a model for Jev" value={model} onChange={setModel} onSubmit={onUse} options={status.models.map((m) => ({ value: m, label: m }))} />
          </>
        )}
        {note ? <Text color="green">{`  ${note}`}</Text> : null}
        <Text dimColor>
          {hasModels ? "  enter use model · w AI helper · s skip Jev · b back · q quit" : "  w write AI helper · r recheck · s skip Jev · b back · q quit"}
        </Text>
      </Panel>
    </Box>
  );
}
