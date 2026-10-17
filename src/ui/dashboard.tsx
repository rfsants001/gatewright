// `gate` home — the machine dashboard. On launch it auto-runs detection (with a
// loading spinner), then shows a web-like overview: an ASCII logo, a status line,
// a Claude Code panel (MCPs / skills / plugins, auto-detected) beside Local-AI / Jev
// / Proxies panels, and a short action menu. Actions hand off to the agent or to the
// existing flows.

import { spawnSync } from "node:child_process";
import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { Logo, Spinner, Panel, Icon, SelectList, type Choice } from "./components/index.js";
import { detect } from "../core/env/detect.js";
import { summarize, type Check, type CheckStatus, type EnvironmentReport } from "../core/env/types.js";
import { claudeCodeOverview, type ClaudeCodeOverview } from "../core/env/claude-code.js";

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

function ClaudeCodePanel({ cc }: { cc: ClaudeCodeOverview }) {
  return (
    <Panel title="Claude Code" color={cc.installed ? "green" : "red"}>
      <Text>
        <Icon name={cc.installed ? "ok" : "bad"} color={cc.installed ? "green" : "red"} />{" "}
        {cc.installed ? "installed" : "not installed"}
        {cc.configDir ? <Text dimColor>{`  ${cc.configDir}`}</Text> : null}
      </Text>

      <Text bold>{`MCP servers (${cc.mcps.length})`}</Text>
      {cc.mcps.length === 0 ? <Text dimColor>  none</Text> : null}
      {cc.mcps.map((m) => (
        <Text key={m.name}>
          <Icon name="bullet" color="cyan" /> {m.name}
          <Text dimColor>{`  ${[m.command, ...m.args].join(" ")}`}</Text>
        </Text>
      ))}

      <Text bold>{`Skills (${cc.skills.length})`}</Text>
      {cc.skills.length === 0 ? <Text dimColor>  none detected</Text> : null}
      {cc.skills.slice(0, 10).map((s) => (
        <Text key={`${s.source}:${s.name}`}>
          <Icon name="bullet" color="magenta" /> {s.name}
          <Text dimColor>{`  [${s.source}]`}</Text>
        </Text>
      ))}

      <Text bold>{`Plugins (${cc.plugins.length})`}</Text>
      {cc.plugins.length === 0 ? <Text dimColor>  none detected</Text> : null}
      {cc.plugins.map((p) => (
        <Text key={p.name}>
          <Icon name="bullet" color="blue" /> {p.name}
        </Text>
      ))}
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
    <Box flexDirection="column" paddingX={1} gap={1}>
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
        <Box flexDirection="column" width="44%" gap={1}>
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
              data.proxies.map((p) => (
                <Text key={p.name}>
                  <Icon name="bullet" color="cyan" /> {p.name}
                  <Text dimColor>{`  ${p.value}`}</Text>
                </Text>
              ))
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
