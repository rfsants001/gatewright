// Jev local-AI setup — check Ollama, guide installation if missing, let the user
// pick a model, and (optionally) drop an AI-helper doc the main agent can follow.

import { useEffect, useState } from "react";
import { homedir } from "node:os";
import { Box, Text, useInput } from "ink";
import { Icon, Spinner, Panel, RadioGroup } from "./components/index.js";
import { detectOllama, writeOllamaHelper, type OllamaStatus } from "../core/jev/ollama.js";

const short = (p: string): string => p.replace(homedir(), "~");

export function OllamaSetup({ onUse, onSkip, onBack, onQuit }: { onUse: (model: string) => void; onSkip: () => void; onBack: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const [status, setStatus] = useState<"detecting" | OllamaStatus>("detecting");
  const [model, setModel] = useState("");
  const [note, setNote] = useState("");

  const check = (): void => {
    setStatus("detecting");
    void detectOllama().then((s) => {
      setStatus(s);
      if (s.models[0]) setModel(s.models[0]);
    });
  };
  useEffect(() => check(), []);

  const hasModels = status !== "detecting" && status.reachable && status.models.length > 0;

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onBack();
    else if (input === "s") onSkip();
    else if (input === "r") check();
    else if (input === "w") {
      const p = writeOllamaHelper(cwd, model || "qwen2.5");
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
            <Text dimColor>  Then:     ollama pull qwen2.5</Text>
          </>
        ) : !hasModels ? (
          <>
            <Text>
              <Icon name="warn" color="yellow" /> Ollama is running, but has no models
            </Text>
            <Text dimColor>  Pull one:  ollama pull qwen2.5</Text>
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
