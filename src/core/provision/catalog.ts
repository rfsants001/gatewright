// The tools the gate can set up out of the box. Ollama and LiteLLM ship concrete
// installers; graphify has no verified installer, so it collects a command from the
// user (same path as a fully custom package). A pasted-command tool is built on demand.

import { platform } from "node:os";
import type { CommandProbe } from "../env/probes.js";
import type { ConfigScope } from "../config/config-store.js";
import type { ProvisionStep, ProvisionTool } from "./types.js";

const sh = (label: string, script: string): ProvisionStep => ({ label, command: "sh", args: ["-c", script] });

function probeVersion(probe: CommandProbe, bin: string): { installed: boolean; version?: string } {
  const version = probe(bin, ["--version"]);
  return version === null ? { installed: false } : { installed: true, version };
}

export const ollamaTool: ProvisionTool = {
  id: "ollama",
  name: "Ollama",
  description: "Local model runtime — installs Ollama and pulls a model.",
  scope: "gate",
  params: [{ key: "model", label: "Model to pull", default: "llama3.2" }],
  detect: (probe) => probeVersion(probe, "ollama"),
  buildSteps: (params) => {
    const model = params["model"] || "llama3.2";
    const steps: ProvisionStep[] = [];
    if (platform() === "win32") {
      steps.push(sh("Install Ollama", "echo 'On Windows, install Ollama from https://ollama.com/download, then re-run' && exit 1"));
    } else {
      steps.push(sh("Install Ollama (if missing)", "command -v ollama >/dev/null 2>&1 || curl -fsSL https://ollama.com/install.sh | sh"));
    }
    steps.push(sh(`Pull ${model}`, `ollama pull ${model}`));
    return steps;
  },
};

export const litellmTool: ProvisionTool = {
  id: "litellm",
  name: "LiteLLM",
  description: "OpenAI-compatible proxy over many providers — installs via pip.",
  scope: "gate",
  detect: (probe) => probeVersion(probe, "litellm"),
  buildSteps: () => [sh("Install LiteLLM", "python3 -m pip install --user litellm")],
};

/** graphify: no verified installer — collect a command from the user. */
export const graphifyTool: ProvisionTool = {
  id: "graphify",
  name: "graphify",
  description: "Project graph to save agent tokens — paste its install command.",
  scope: "project",
  detect: (probe) => probeVersion(probe, "graphify"),
  // no buildSteps → needs a user-supplied command
};

export const CATALOG: ProvisionTool[] = [ollamaTool, litellmTool, graphifyTool];

/** Build an ad-hoc tool for a pasted install command. */
export function customTool(id: string, command: string, scope: ConfigScope): ProvisionTool {
  return {
    id,
    name: id,
    description: "Custom package.",
    scope,
    detect: () => ({ installed: false }),
    buildSteps: () => [sh(`Install ${id}`, command)],
  };
}
