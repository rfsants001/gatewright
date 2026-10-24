// The Gatewright TUI app — a single Ink "SPA" with internal routing. Config flows
// stream animated logs (StepList); Jev routes through an Ollama setup step; History
// and Rollback are first-class screens. Only Launch and Quit leave the app.

import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { useEffect, useRef, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { Logo, Spinner, Panel, CheckboxGroup, SelectList, StepList, type Choice, type Step } from "./components/index.js";
import { HomeView, AgentDetail, type DashboardData, type Route } from "./dashboard.js";
import { OllamaSetup } from "./ollama-setup.js";
import { HistoryScreen, RollbackScreen } from "./history-screen.js";
import { RunComposer, type ComposerEngine } from "./run-composer.js";
import { RunLive } from "./run-live.js";
import { RunScreen } from "./run-screen.js";
import { SettingsScreen } from "./settings-screen.js";
import { ProvisionScreen } from "./provision-screen.js";
import { SkillsScreen } from "./skills-screen.js";
import { FlowScreen, type RunEngine } from "./flow-screen.js";
import { AskPrompts } from "./ask-prompt.js";
import { ConfigStore } from "../core/config/config-store.js";
import { loadGateSkills, buildSkillsSystemPrompt } from "../core/skills/gate-catalog.js";
import { buildApplySteps } from "./apply-steps.js";
import { detect } from "../core/env/detect.js";
import type { CheckStatus, EnvironmentReport } from "../core/env/types.js";
import { claudeCodeOverview, type ClaudeCodeOverview } from "../core/env/claude-code.js";
import { planHooks, planJev, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { jevConfigPath, JevConfigStore } from "../core/jev/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigHistory } from "../core/history/config-history.js";
import { scaffoldProject } from "../core/init/scaffold.js";
import { ProjectRegistry } from "../core/project/registry.js";
import { defaultEngineRegistry } from "../core/engine/default-registry.js";
import { ensureGateMcpConfig } from "../core/engine/gate-mcp-config.js";
import { startRun, type RunHandle } from "../core/engine/runner.js";
import type { EngineRunOptions } from "../core/engine/types.js";
import type { ControlState } from "../core/control/control-state.js";
import type { EngineEvent } from "../core/engine/types.js";

const OLLAMA_ENDPOINT = "http://localhost:11434";
const PROXY_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"];

function readProxies(): { name: string; value: string }[] {
  return PROXY_KEYS.map((k) => ({ name: k, value: process.env[k] ?? process.env[k.toLowerCase()] ?? "" })).filter((p) => p.value);
}
function checkStatus(report: EnvironmentReport, title: string, label: string): CheckStatus {
  return report.groups.find((g) => g.title === title)?.checks.find((c) => c.label === label)?.status ?? "missing";
}
function buildData(report: EnvironmentReport, cc: ClaudeCodeOverview): DashboardData {
  const agents: DashboardData["agents"] = [
    {
      id: "claude-code",
      name: "Claude Code",
      installed: cc.installed,
      summary: cc.installed ? `${cc.commands.length} cmds · ${cc.skills.length} skills · ${cc.mcps.length} MCP` : "not installed",
    },
  ];
  if (checkStatus(report, "Hosts", "Codex CLI") === "ok") {
    agents.push({ id: "codex", name: "Codex", installed: true, summary: "basic detection" });
  }
  return { report, cc, agents, proxies: readProxies(), hasHistory: new ConfigHistory().list().length > 0 };
}

function jevPlan(model: string): WritePlan {
  return planJev(jevConfigPath(), { enabled: true, endpoint: OLLAMA_ENDPOINT, model, budget: {} });
}

function RunPanel({ title, steps, finished, onDone }: { title: string; steps: Step[]; finished: boolean; onDone: () => void }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title={title} color="cyan">
        <StepList steps={steps} onDone={onDone} />
        {finished ? <Text dimColor>  enter / b — back</Text> : null}
      </Panel>
    </Box>
  );
}

// ── Config ──────────────────────────────────────────────────────────────────

function ConfigPage({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  // Reflect what's already persisted so toggles aren't silently reset — Jev in
  // particular lives in a saved config and must come back checked when enabled.
  const [selected, setSelected] = useState<string[]>(() => {
    const base = ["claude", "mcp"];
    return new JevConfigStore(new FileArtifactStore()).read().enabled ? [...base, "jev"] : base;
  });
  const [phase, setPhase] = useState<"form" | "ollama" | "run">("form");
  const [steps, setSteps] = useState<Step[]>([]);
  const [finished, setFinished] = useState(false);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if ((input === "b" || key.escape) && phase === "form") onDone();
    else if (finished && (key.return || input === "b")) onDone();
  });

  const run = (jevModel?: string): void => {
    const plans: WritePlan[] = [];
    if (selected.includes("claude")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
    if (selected.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
    if (jevModel) plans.push(jevPlan(jevModel));
    const extra: Step[] = [
      { label: "Ensuring project folders", run: () => { const s = scaffoldProject(cwd); return s.created.length ? `created ${s.created.join(", ")}` : "all present"; } },
      { label: "Registering project", run: () => { new ProjectRegistry().register({ path: cwd, name: basename(cwd), configuredAt: new Date().toISOString(), meta: { hosts: selected } }); return basename(cwd); } },
    ];
    setSteps(buildApplySteps(plans, { project: cwd, kind: "configure", extra }).steps);
    setPhase("run");
  };

  if (phase === "ollama") {
    return <OllamaSetup onUse={(m) => run(m)} onSkip={() => run()} onBack={() => setPhase("form")} onQuit={onQuit} />;
  }
  if (phase === "run") {
    return <RunPanel title="Configuring this project" steps={steps} finished={finished} onDone={() => setFinished(true)} />;
  }

  const options: Choice<string>[] = [
    { value: "claude", label: "Claude Code hooks" },
    { value: "mcp", label: "MCP server (.mcp.json)" },
    { value: "jev", label: "Enable Jev (local AI, advisory)" },
  ];
  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title="Configure this project" color="cyan">
        <Text dimColor>Wire Gatewright into this project. Nothing is written until you apply.</Text>
        <CheckboxGroup
          options={options}
          selected={selected}
          onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
          onSubmit={() => (selected.includes("jev") ? setPhase("ollama") : run())}
        />
        <Text dimColor>  space toggle · enter apply · b back · existing files backed up (.bak)</Text>
      </Panel>
    </Box>
  );
}

// ── Fix ───────────────────────────────────────────────────────────────────────

function FixPage({ data, onDone, onQuit }: { data: DashboardData; onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const st = (t: string, l: string): CheckStatus => checkStatus(data.report, t, l);
  const fixable: Choice<string>[] = [];
  if (st("Hosts", "hooks wired") !== "ok") fixable.push({ value: "hooks", label: "Wire Claude Code hooks" });
  if (st("Hosts", "MCP server") !== "ok") fixable.push({ value: "mcp", label: "Register MCP server" });
  if (st("Jev", "Jev") !== "ok") fixable.push({ value: "jev", label: "Enable Jev (local AI, advisory)" });

  const [selected, setSelected] = useState<string[]>(fixable.map((f) => f.value));
  const [phase, setPhase] = useState<"form" | "ollama" | "run">("form");
  const [steps, setSteps] = useState<Step[]>([]);
  const [finished, setFinished] = useState(false);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if ((input === "b" || key.escape) && phase === "form") onDone();
    else if (finished && (key.return || input === "b")) onDone();
  });

  const run = (jevModel?: string): void => {
    const plans: WritePlan[] = [];
    if (selected.includes("hooks")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
    if (selected.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
    if (jevModel) plans.push(jevPlan(jevModel));
    setSteps(buildApplySteps(plans, { project: cwd, kind: "fix" }).steps);
    setPhase("run");
  };

  if (phase === "ollama") {
    return <OllamaSetup onUse={(m) => run(m)} onSkip={() => run()} onBack={() => setPhase("form")} onQuit={onQuit} />;
  }
  if (phase === "run") {
    return <RunPanel title="Fixing pending items" steps={steps} finished={finished} onDone={() => setFinished(true)} />;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      {fixable.length === 0 ? (
        <Panel title="Fix" color="green">
          <Text>✓ nothing to fix — everything is configured</Text>
          <Text dimColor>  b back</Text>
        </Panel>
      ) : (
        <Panel title="Fix pending items" color="cyan">
          <Text dimColor>Configure only what's missing or incomplete. Existing files are backed up.</Text>
          <CheckboxGroup
            options={fixable}
            selected={selected}
            onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
            onSubmit={() => (selected.includes("jev") ? setPhase("ollama") : run())}
          />
          <Text dimColor>  space toggle · enter apply · b back</Text>
        </Panel>
      )}
    </Box>
  );
}

// ── Dogfood ─────────────────────────────────────────────────────────────────

function DogfoodPage({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const plans: WritePlan[] = [planHooks(join(cwd, ".claude", "settings.json")), planMcp(join(cwd, ".mcp.json"))];
  const toApply = plans.filter((p) => p.action !== "noop");
  const [phase, setPhase] = useState<"confirm" | "run">("confirm");
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [finished, setFinished] = useState(false);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if ((input === "b" || key.escape) && phase === "confirm") onDone();
    else if (finished && (key.return || input === "b")) onDone();
  });

  const run = (force = false): void => {
    // force re-applies even when already correct — "redo the configuration".
    const p = force ? [planHooks(join(cwd, ".claude", "settings.json"), true), planMcp(join(cwd, ".mcp.json"), true)] : plans;
    const extra: Step[] = [{ label: "Ensuring project folders", run: () => { const s = scaffoldProject(cwd); return s.created.length ? `created ${s.created.join(", ")}` : "all present"; } }];
    setSteps(buildApplySteps(p, { project: cwd, kind: "configure", extra }).steps);
    setPhase("run");
  };

  if (phase === "run") {
    return <RunPanel title="Setting up dogfood" steps={steps} finished={finished} onDone={() => setFinished(true)} />;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      {toApply.length === 0 ? (
        <Panel title="Dogfood  ·  already set up" color="green">
          <Text>✓ hooks + MCP are wired — open your agent here; the gates are live.</Text>
          <Text dimColor>You can redo the setup to reset the config to the correct state.</Text>
          <SelectList
            options={[{ value: "redo", label: "Reconfigure (reset to correct)" }, { value: "back", label: "Back" }]}
            index={index}
            onMove={setIndex}
            onSelect={(v) => (v === "redo" ? run(true) : onDone())}
          />
          <Text dimColor>  ↑↓ move · enter select · b back · q quit</Text>
        </Panel>
      ) : (
        <Panel title="Set up dogfood  ·  wires hooks + MCP" color="cyan">
          <Text dimColor>Set this project up to govern a real agent session.</Text>
          {toApply.map((p) => (
            <Text key={p.path}>{`• ${p.summary}`}</Text>
          ))}
          <SelectList
            options={[{ value: "apply", label: "Apply and set up" }, { value: "back", label: "Back" }]}
            index={index}
            onMove={setIndex}
            onSelect={(v) => (v === "apply" ? run() : onDone())}
          />
          <Text dimColor>  existing files backed up (.bak) · b back · q quit</Text>
        </Panel>
      )}
    </Box>
  );
}

// ── Run (cockpit) ─────────────────────────────────────────────────────────────

/** The prompt for an AI-driven install; the gate-package-installer skill (injected) carries the method. */
function buildInstallPrompt(target: string): string {
  return (
    `Install and configure "${target}" into this environment so Gatewright can use it. ` +
    `Follow the gate-package-installer skill: read the project's README and manifest, pick the documented install method, ` +
    `run it, verify it works (version/help), and report exactly what you did, where its config lives, and how to use it. ` +
    `Show any download-and-run script before executing it and confirm before anything destructive.`
  );
}

function RunPage({ onDone, onQuit, autoPrompt }: { onDone: () => void; onQuit: () => void; autoPrompt?: string }) {
  const cwd = process.cwd();
  const [registry] = useState(() => defaultEngineRegistry());
  const [mcpConfigPath] = useState(() => ensureGateMcpConfig(cwd));
  const [preferredEngineId] = useState(() => new ConfigStore(new FileArtifactStore()).resolve(cwd).defaultEngine);
  const [engines, setEngines] = useState<ComposerEngine[] | null>(null);

  useEffect(() => {
    void (async () => {
      const detected = await registry.detectAll();
      setEngines(
        detected.map((d) => {
          let supported = true;
          try {
            d.adapter.buildHeadlessCommand({ prompt: "", cwd, mcpConfigPath });
          } catch {
            supported = false;
          }
          return {
            id: d.adapter.id,
            name: d.adapter.name,
            installed: d.availability.installed,
            supported,
            ...(d.availability.loggedIn === false ? { loggedOut: true } : {}),
            ...(d.availability.detail ? { detail: d.availability.detail } : {}),
          };
        }),
      );
    })();
  }, []);

  return (
    <RunScreen
      engines={engines}
      cwd={cwd}
      mcpConfigPath={mcpConfigPath}
      registry={registry}
      {...(preferredEngineId ? { preferredEngineId } : {})}
      {...(autoPrompt ? { autoPrompt } : {})}
      onBack={onDone}
      onQuit={onQuit}
    />
  );
}

// ── Flow (end-to-end) ─────────────────────────────────────────────────────────

function FlowPage({ onDone }: { onDone: () => void }) {
  const cwd = process.cwd();
  const [registry] = useState(() => defaultEngineRegistry());
  const [mcpConfigPath] = useState(() => ensureGateMcpConfig(cwd));
  const [preferredEngineId] = useState(() => new ConfigStore(new FileArtifactStore()).resolve(cwd).defaultEngine);
  const [skillsPrompt] = useState(() => buildSkillsSystemPrompt(loadGateSkills().list()));
  const [engineId, setEngineId] = useState<string | null | undefined>(undefined); // undefined=detecting, null=none usable
  const [goal, setGoal] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const detected = await registry.detectAll();
      const usable = detected
        .filter((d) => d.availability.installed)
        .map((d) => d.adapter.id)
        .filter((id) => {
          try {
            registry.get(id).buildHeadlessCommand({ prompt: "", cwd, mcpConfigPath });
            return true;
          } catch {
            return false;
          }
        });
      setEngineId(usable.find((id) => id === preferredEngineId) ?? usable[0] ?? null);
    })();
  }, []);

  if (engineId === undefined) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Logo />
        <Spinner label="detecting engines…" />
      </Box>
    );
  }
  if (engineId === null) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Logo />
        <Panel title="Flow" color="yellow">
          <Text>No usable engine found. Install Claude Code (and log in) to run a flow.</Text>
          <Text dimColor>  b back</Text>
        </Panel>
      </Box>
    );
  }
  if (goal === null) {
    return (
      <AskPrompts
        title="New flow — end to end"
        questions={[{ id: "goal", type: "text", prompt: "What do you want to build? (goal → SDD → review → PR)" }]}
        onComplete={(a) => setGoal(typeof a["goal"] === "string" ? a["goal"] : "")}
        onCancel={onDone}
      />
    );
  }

  const runEngine: RunEngine = (prompt, handlers) => {
    let text = "";
    const h = startRun(
      registry.get(engineId),
      { prompt, cwd, mcpConfigPath, ...(skillsPrompt ? { systemPrompt: skillsPrompt } : {}) },
      {
        onEvent: (e) => {
          if (e.text && (e.kind === "assistant" || e.kind === "result")) text += `${e.text}\n`;
          handlers.onEvent(e);
        },
        onState: handlers.onState,
      },
    );
    return { done: h.done.then(() => text), cancel: () => h.cancel() };
  };

  return <FlowScreen goal={goal} runEngine={runEngine} onDone={onDone} />;
}

function BasicDetail({ name, onBack, onQuit }: { name: string; onBack: () => void; onQuit: () => void }) {
  useInput((input, key) => {
    if (input === "b" || key.escape || key.leftArrow) onBack();
    else if (input === "q") onQuit();
  });
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">{` ${name} · detail `}</Text>
      <Text dimColor>deeper detection for this agent is coming soon.</Text>
      <Text dimColor>  b back · q quit</Text>
    </Box>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────

function App({ onExit, initialRoute = "home" }: { onExit: (reason: "launch" | "quit") => void; initialRoute?: Route }) {
  const { exit } = useApp();
  const exitWith = (reason: "launch" | "quit"): void => {
    onExit(reason);
    exit();
  };
  const [route, setRoute] = useState<Route>(initialRoute);
  const [agentIndex, setAgentIndex] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [aiInstallPrompt, setAiInstallPrompt] = useState<string | undefined>(undefined);

  const load = (): void => {
    setData(null);
    void (async () => {
      const report = await detect();
      setData(buildData(report, claudeCodeOverview()));
    })();
  };
  useEffect(() => load(), []);

  if (!data) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Logo />
        <Spinner label="scanning your machine…" />
      </Box>
    );
  }

  const back = (): void => setRoute("home");
  const backAndReload = (): void => { setRoute("home"); load(); };

  switch (route) {
    case "detail": {
      const agent = data.agents[agentIndex];
      return agent?.id === "claude-code" ? (
        <AgentDetail cc={data.cc} onBack={back} onQuit={() => exitWith("quit")} />
      ) : (
        <BasicDetail name={agent?.name ?? "agent"} onBack={back} onQuit={() => exitWith("quit")} />
      );
    }
    case "config":
      return <ConfigPage onDone={backAndReload} onQuit={() => exitWith("quit")} />;
    case "fix":
      return <FixPage data={data} onDone={backAndReload} onQuit={() => exitWith("quit")} />;
    case "dogfood":
      return <DogfoodPage onDone={backAndReload} onQuit={() => exitWith("quit")} />;
    case "run":
      return <RunPage onDone={() => { setAiInstallPrompt(undefined); backAndReload(); }} onQuit={() => exitWith("quit")} {...(aiInstallPrompt ? { autoPrompt: aiInstallPrompt } : {})} />;
    case "settings":
      return <SettingsScreen cwd={process.cwd()} engineIds={data.agents.map((a) => a.id)} onBack={back} onQuit={() => exitWith("quit")} />;
    case "provision":
      return (
        <ProvisionScreen
          cwd={process.cwd()}
          onBack={backAndReload}
          onQuit={() => exitWith("quit")}
          onAiInstall={(target) => { setAiInstallPrompt(buildInstallPrompt(target)); setRoute("run"); }}
        />
      );
    case "skills":
      return <SkillsScreen onBack={back} onQuit={() => exitWith("quit")} />;
    case "flow":
      return <FlowPage onDone={backAndReload} />;
    case "history":
      return <HistoryScreen onBack={back} onQuit={() => exitWith("quit")} />;
    case "rollback":
      return <RollbackScreen onDone={backAndReload} onQuit={() => exitWith("quit")} />;
    default:
      return (
        <HomeView
          data={data}
          agentIndex={agentIndex}
          onAgentMove={setAgentIndex}
          onOpenAgent={() => setRoute("detail")}
          onNavigate={setRoute}
          onLaunch={() => exitWith("launch")}
          onRefresh={load}
          onQuit={() => exitWith("quit")}
        />
      );
  }
}

export { App };

function launchClaude(): void {
  const result = spawnSync("claude", [], { stdio: "inherit", cwd: process.cwd() });
  if (result.error) {
    process.stdout.write("gate: 'claude' was not found on PATH. Install Claude Code, then try again.\n");
  }
}

export async function runApp(initialRoute: Route = "home"): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write("gate: the dashboard needs an interactive terminal (TTY). Try `gate doctor` for a plain report.\n");
    return 1;
  }
  for (;;) {
    const box: { reason: "launch" | "quit" } = { reason: "quit" };
    const { waitUntilExit } = render(<App onExit={(r) => (box.reason = r)} initialRoute={initialRoute} />);
    await waitUntilExit();
    if (box.reason === "launch") {
      launchClaude();
      continue;
    }
    return 0;
  }
}
