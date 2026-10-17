// `gate` home — the machine dashboard. On launch it auto-runs detection (with a
// loading spinner), then shows a web-like overview: an ASCII logo, a status line,
// a Claude Code panel (MCPs / skills / plugins, auto-detected) beside Local-AI / Jev
// / Proxies panels, and a short action menu. Actions hand off to the agent or to the
// existing flows.

import { spawnSync } from "node:child_process";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { Logo, Spinner, Panel, Icon, SelectList, type Choice } from "./components/index.js";
import { detect } from "../core/env/detect.js";
import { summarize, type Check, type CheckStatus, type EnvironmentReport } from "../core/env/types.js";
import { claudeCodeOverview, type ClaudeCodeOverview } from "../core/env/claude-code.js";

function Line({ icon, color, text, dim }: { icon: "bullet"; color: string; text: string; dim?: string }) {
  return (
    <Text>
      <Icon name={icon} color={color} /> {text}
      {dim ? <Text dimColor>{`  ${dim}`}</Text> : null}
    </Text>
  );
}

type Action = "launch" | "init" | "fix" | "dogfood" | "refresh" | "exit";

interface DashboardData {
  report: EnvironmentReport;
  cc: ClaudeCodeOverview;
  proxies: { name: string; value: string }[];
}

const PROXY_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"];

function readProxies(): { name: string; value: string }[] {
  return PROXY_KEYS.map((k) => ({ name: k, value: process.env[k] ?? process.env[k.toLowerCase()] ?? "" })).filter((p) => p.value);
}

function statusColor(status: CheckStatus): string {
  return status === "ok" ? "green" : status === "warn" ? "yellow" : "red";
}
function statusIcon(status: CheckStatus): "ok" | "warn" | "bad" {
  return status === "ok" ? "ok" : status === "warn" ? "warn" : "bad";
}

function CheckRow({ check }: { check: Check }) {
  return (
    <Text>
      <Icon name={statusIcon(check.status)} color={statusColor(check.status)} /> {check.label}
      {check.detail ? <Text dimColor>{`  ${check.detail}`}</Text> : null}
    </Text>
  );
}

function groupChecks(report: EnvironmentReport, title: string): Check[] {
  return report.groups.find((g) => g.title === title)?.checks ?? [];
}

function Section<T>({ title, items, render, color, empty = "none" }: { title: string; items: T[]; render: (item: T) => ReactElement; color: string; empty?: string }) {
  return (
    <Box flexDirection="column">
      <Text bold color={color}>{`${title} (${items.length})`}</Text>
      {items.length === 0 ? <Text dimColor>{`  ${empty}`}</Text> : items.map(render)}
    </Box>
  );
}

function ClaudeCodePanel({ cc }: { cc: ClaudeCodeOverview }) {
  return (
    <Panel title="Claude Code" color={cc.installed ? "green" : "red"}>
      <Text>
        <Icon name={cc.installed ? "ok" : "bad"} color={cc.installed ? "green" : "red"} />{" "}
        {cc.installed ? "installed" : "not installed"}
        {cc.configDir ? <Text dimColor>{`  ${cc.configDir}`}</Text> : null}
      </Text>
      <Section title="MCP servers" color="cyan" items={cc.mcps} render={(m) => <Line key={m.name} icon="bullet" color="cyan" text={m.name} dim={[m.command, ...m.args].join(" ")} />} />
      <Section title="Commands" color="green" items={cc.commands} empty="none created" render={(c) => <Line key={`${c.source}:${c.name}`} icon="bullet" color="green" text={`/${c.name}`} dim={`[${c.source}]`} />} />
      <Section title="Skills" color="magenta" items={cc.skills.slice(0, 12)} empty="none installed" render={(s) => <Line key={`${s.source}:${s.name}`} icon="bullet" color="magenta" text={s.name} dim={`[${s.source}]`} />} />
      <Section title="Plugins" color="blue" items={cc.plugins} empty="none" render={(p) => <Line key={p.name} icon="bullet" color="blue" text={p.name} />} />
    </Panel>
  );
}

export function Dashboard({ onAction }: { onAction: (a: Action) => void }) {
  const { exit } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const report = await detect();
      const cc = claudeCodeOverview();
      if (alive) setData({ report, cc, proxies: readProxies() });
    })();
    return () => {
      alive = false;
    };
  }, []);

  useInput((input) => {
    if (input === "q") {
      onAction("exit");
      exit();
    } else if (input === "r") {
      onAction("refresh");
      exit();
    }
  });

  if (!data) {
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Logo />
        <Spinner label="scanning your machine…" />
      </Box>
    );
  }

  const tally = summarize(data.report);
  const actions: Choice<Action>[] = [
    ...(data.cc.installed ? [{ value: "launch" as const, label: "Launch Claude Code here", hint: "handoff" }] : []),
    { value: "init", label: "Configure this project", hint: "wizard" },
    { value: "fix", label: "Fix pending items" },
    { value: "dogfood", label: "Set up dogfood" },
    { value: "refresh", label: "Refresh" },
    { value: "exit", label: "Exit" },
  ];

  const select = (a: Action): void => {
    onAction(a);
    exit();
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Box gap={3}>
        <Text>
          <Icon name="ok" color="green" /> {`${tally.ok} ready`}
        </Text>
        <Text>
          <Icon name="warn" color="yellow" /> {`${tally.warn} to configure`}
        </Text>
        <Text>
          <Icon name="bad" color="red" /> {`${tally.missing} missing`}
        </Text>
      </Box>

      <Box gap={1}>
        <Box width="56%">
          <ClaudeCodePanel cc={data.cc} />
        </Box>
        <Box flexDirection="column" width="44%">
          <Panel title="Local AI">
            {groupChecks(data.report, "Local AI").map((c) => (
              <CheckRow key={c.label} check={c} />
            ))}
          </Panel>
          <Panel title="Jev">
            {groupChecks(data.report, "Jev").map((c) => (
              <CheckRow key={c.label} check={c} />
            ))}
          </Panel>
          <Panel title="Proxies">
            {data.proxies.length === 0 ? (
              <Text dimColor>  none active</Text>
            ) : (
              data.proxies.map((p) => <Line key={p.name} icon="bullet" color="cyan" text={p.name} dim={p.value} />)
            )}
          </Panel>
        </Box>
      </Box>

      <Panel title="Actions  ·  ↑↓ move · enter select · r refresh · q quit">
        <SelectList options={actions} index={index} onMove={setIndex} onSelect={select} />
      </Panel>
    </Box>
  );
}

function launchClaude(): number {
  const result = spawnSync("claude", [], { stdio: "inherit", cwd: process.cwd() });
  if (result.error) {
    process.stdout.write("gate: 'claude' was not found on PATH. Install Claude Code, then try again.\n");
    return 1;
  }
  return result.status ?? 0;
}

export async function runDashboard(): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write("gate: the dashboard needs an interactive terminal (TTY). Try `gate doctor` for a plain report.\n");
    return 1;
  }

  for (;;) {
    let action: Action = "exit";
    const { waitUntilExit } = render(<Dashboard onAction={(a) => (action = a)} />);
    await waitUntilExit();

    if (action === "exit") return 0;
    if (action === "refresh") continue;
    if (action === "launch") return launchClaude();

    if (action === "init") {
      const { runInit } = await import("./init.js");
      await runInit();
    } else if (action === "fix") {
      const { runFix } = await import("./history.js");
      await runFix();
    } else if (action === "dogfood") {
      const { runDogfood } = await import("./dogfood.js");
      await runDogfood();
    }
    // loop back to the dashboard
  }
}
