// The Gatewright TUI app — a single Ink "SPA": one persistent render with internal
// routing between pages (home · agent detail · config · fix · dogfood). Only Launch
// and Quit leave the app; everything else navigates in place. After a Launch handoff
// the agent takes the terminal and, when it exits, we re-enter the dashboard.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { Logo, Spinner, Panel, CheckboxGroup, SelectList, type Choice } from "./components/index.js";
import { HomeView, AgentDetail, type DashboardData, type Route } from "./dashboard.js";
import { detect } from "../core/env/detect.js";
import type { CheckStatus, EnvironmentReport } from "../core/env/types.js";
import { claudeCodeOverview, type ClaudeCodeOverview } from "../core/env/claude-code.js";
import { planHooks, planJev, planMcp, type WritePlan } from "../core/init/config-writers.js";
import { jevConfigPath } from "../core/jev/config-store.js";
import { ConfigHistory, applyWithHistory } from "../core/history/config-history.js";

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
  return { report, cc, agents, proxies: readProxies() };
}

function Result({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Panel title={title} color="green">
      {lines.map((l, i) => (
        <Text key={i}>{l}</Text>
      ))}
      <Text dimColor>  enter / b — back</Text>
    </Panel>
  );
}

// ── Config page ───────────────────────────────────────────────────────────────

function ConfigPage({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const [selected, setSelected] = useState<string[]>(["claude", "mcp"]);
  const [result, setResult] = useState<string[] | null>(null);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onDone();
    else if (result && key.return) onDone();
  });

  const options: Choice<string>[] = [
    { value: "claude", label: "Claude Code hooks" },
    { value: "mcp", label: "MCP server (.mcp.json)" },
    { value: "jev", label: "Enable Jev (advisory)" },
  ];

  const apply = (): void => {
    const plans: WritePlan[] = [];
    if (selected.includes("claude")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
    if (selected.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
    if (selected.includes("jev")) plans.push(planJev(jevConfigPath(), { enabled: true, endpoint: "http://localhost:11434", model: "llama3.2", budget: {} }));
    const rev = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "configure", backup: true });
    const lines = plans.map((p) => (p.action === "noop" ? `· ${p.summary}` : `✓ ${p.summary}`));
    if (plans.length === 0) lines.push("nothing selected");
    if (rev) lines.push(`recorded ${rev.id} — rollback to undo`);
    setResult(lines);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      {result ? (
        <Result title="Configured" lines={result} />
      ) : (
        <Panel title="Configure this project" color="cyan">
          <CheckboxGroup
            options={options}
            selected={selected}
            onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
            onSubmit={apply}
          />
          <Text dimColor>  space toggle · enter apply · b back · existing files backed up (.bak)</Text>
        </Panel>
      )}
    </Box>
  );
}

// ── Fix page ──────────────────────────────────────────────────────────────────

function FixPage({ data, onDone, onQuit }: { data: DashboardData; onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const st = (t: string, l: string): CheckStatus => checkStatus(data.report, t, l);
  const fixable: Choice<string>[] = [];
  if (st("Hosts", "hooks wired") !== "ok") fixable.push({ value: "hooks", label: "Wire Claude Code hooks" });
  if (st("Hosts", "MCP server") !== "ok") fixable.push({ value: "mcp", label: "Register MCP server" });
  if (st("Jev", "Jev") !== "ok") fixable.push({ value: "jev", label: "Enable Jev (advisory)" });

  const [selected, setSelected] = useState<string[]>(fixable.map((f) => f.value));
  const [result, setResult] = useState<string[] | null>(null);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onDone();
    else if (result && key.return) onDone();
  });

  const apply = (): void => {
    const plans: WritePlan[] = [];
    if (selected.includes("hooks")) plans.push(planHooks(join(cwd, ".claude", "settings.json")));
    if (selected.includes("mcp")) plans.push(planMcp(join(cwd, ".mcp.json")));
    if (selected.includes("jev")) plans.push(planJev(jevConfigPath(), { enabled: true, endpoint: "http://localhost:11434", model: "llama3.2", budget: {} }));
    const rev = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "fix", backup: true });
    const lines = plans.map((p) => (p.action === "noop" ? `· ${p.summary}` : `✓ ${p.summary}`));
    if (rev) lines.push(`recorded ${rev.id} — rollback to undo`);
    setResult(lines);
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      {result ? (
        <Result title="Fixed" lines={result} />
      ) : fixable.length === 0 ? (
        <Panel title="Fix" color="green">
          <Text>✓ nothing to fix — everything is configured</Text>
          <Text dimColor>  b back</Text>
        </Panel>
      ) : (
        <Panel title="Fix pending items" color="cyan">
          <CheckboxGroup
            options={fixable}
            selected={selected}
            onToggle={(v) => setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
            onSubmit={apply}
          />
          <Text dimColor>  space toggle · enter apply · b back</Text>
        </Panel>
      )}
    </Box>
  );
}

// ── Dogfood page ──────────────────────────────────────────────────────────────

function DogfoodPage({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const cwd = process.cwd();
  const plans: WritePlan[] = [planHooks(join(cwd, ".claude", "settings.json")), planMcp(join(cwd, ".mcp.json"))];
  const toApply = plans.filter((p) => p.action !== "noop");
  const [result, setResult] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if ((input === "b" || key.escape) && !result) onDone();
    else if (result && key.return) onDone();
  });

  const apply = (): void => {
    const rev = applyWithHistory(plans, { history: new ConfigHistory(), project: cwd, kind: "configure", backup: true });
    void (async () => {
      const report = await detect({ cwd });
      const ok = (l: string): boolean => report.groups.find((g) => g.title === "Hosts")?.checks.find((c) => c.label === l)?.status === "ok";
      const lines = [`${ok("hooks wired") ? "✓" : "✗"} hooks wired`, `${ok("MCP server") ? "✓" : "✗"} MCP server registered`];
      if (rev) lines.push(`recorded ${rev.id} — rollback to undo`);
      lines.push("Open your agent in this folder — the gates run on every tool use.");
      setResult(lines);
    })();
  };

  const options: Choice<string>[] = [
    { value: "apply", label: "Apply and verify" },
    { value: "back", label: "Back" },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      {result ? (
        <Result title="Dogfood ready" lines={result} />
      ) : toApply.length === 0 ? (
        <Panel title="Dogfood" color="green">
          <Text>✓ already set up — open your agent here; the gates are live.</Text>
          <Text dimColor>  b back</Text>
        </Panel>
      ) : (
        <Panel title="Set up dogfood  ·  wires hooks + MCP" color="cyan">
          {toApply.map((p) => (
            <Text key={p.path}>{`• ${p.summary}`}</Text>
          ))}
          <SelectList options={options} index={index} onMove={setIndex} onSelect={(v) => (v === "apply" ? apply() : onDone())} />
          <Text dimColor>  existing files backed up (.bak) · b back · q quit</Text>
        </Panel>
      )}
    </Box>
  );
}

// ── Basic detail (agents without a rich view yet) ─────────────────────────────

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

function App({ onExit }: { onExit: (reason: "launch" | "quit") => void }) {
  const { exit } = useApp();
  const exitWith = (reason: "launch" | "quit"): void => {
    onExit(reason);
    exit();
  };
  const [route, setRoute] = useState<Route>("home");
  const [agentIndex, setAgentIndex] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);

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

  const home = (): void => setRoute("home");

  if (route === "detail") {
    const agent = data.agents[agentIndex];
    return agent?.id === "claude-code" ? (
      <AgentDetail cc={data.cc} onBack={home} onQuit={() => exitWith("quit")} />
    ) : (
      <BasicDetail name={agent?.name ?? "agent"} onBack={home} onQuit={() => exitWith("quit")} />
    );
  }
  if (route === "config") return <ConfigPage onDone={() => { home(); load(); }} onQuit={() => exitWith("quit")} />;
  if (route === "fix") return <FixPage data={data} onDone={() => { home(); load(); }} onQuit={() => exitWith("quit")} />;
  if (route === "dogfood") return <DogfoodPage onDone={() => { home(); load(); }} onQuit={() => exitWith("quit")} />;

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

export { App };

function launchClaude(): void {
  const result = spawnSync("claude", [], { stdio: "inherit", cwd: process.cwd() });
  if (result.error) {
    process.stdout.write("gate: 'claude' was not found on PATH. Install Claude Code, then try again.\n");
  }
}

export async function runApp(): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write("gate: the dashboard needs an interactive terminal (TTY). Try `gate doctor` for a plain report.\n");
    return 1;
  }
  for (;;) {
    const box: { reason: "launch" | "quit" } = { reason: "quit" };
    const { waitUntilExit } = render(<App onExit={(r) => (box.reason = r)} />);
    await waitUntilExit();
    if (box.reason === "launch") {
      launchClaude(); // agent takes the terminal; when it exits we re-enter the dashboard
      continue;
    }
    return 0;
  }
}
