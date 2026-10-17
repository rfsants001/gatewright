// Dashboard views (presentational) — the home overview and the per-agent detail.
// Stateful orchestration (routing, data, launch) lives in app.tsx.

import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Logo, Panel, Icon, Card, SelectList, type Choice } from "./components/index.js";
import type { Check, CheckStatus, EnvironmentReport } from "./../core/env/types.js";
import { summarize } from "./../core/env/types.js";
import type { ClaudeCodeOverview } from "../core/env/claude-code.js";

export type Route = "home" | "detail" | "config" | "fix" | "dogfood";

export interface AgentRow {
  id: "claude-code" | "codex";
  name: string;
  installed: boolean;
  summary: string;
}

export interface DashboardData {
  report: EnvironmentReport;
  cc: ClaudeCodeOverview;
  agents: AgentRow[];
  proxies: { name: string; value: string }[];
}

function statusColor(status: CheckStatus): string {
  return status === "ok" ? "green" : status === "warn" ? "yellow" : "red";
}
function statusIcon(status: CheckStatus): "ok" | "warn" | "bad" {
  return status === "ok" ? "ok" : status === "warn" ? "warn" : "bad";
}
function groupChecks(report: EnvironmentReport, title: string): Check[] {
  return report.groups.find((g) => g.title === title)?.checks ?? [];
}

function CheckRow({ check }: { check: Check }) {
  return (
    <Text>
      <Icon name={statusIcon(check.status)} color={statusColor(check.status)} /> {check.label}
      {check.detail ? <Text dimColor>{`  ${check.detail}`}</Text> : null}
    </Text>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────

export function HomeView({
  data,
  agentIndex,
  onAgentMove,
  onOpenAgent,
  onNavigate,
  onLaunch,
  onRefresh,
  onQuit,
}: {
  data: DashboardData;
  agentIndex: number;
  onAgentMove: (i: number) => void;
  onOpenAgent: () => void;
  onNavigate: (route: Route) => void;
  onLaunch: () => void;
  onRefresh: () => void;
  onQuit: () => void;
}) {
  const [focus, setFocus] = useState<"agents" | "actions">("agents");
  const [actionIndex, setActionIndex] = useState(0);

  useInput((input, key) => {
    if (key.tab) setFocus((f) => (f === "agents" ? "actions" : "agents"));
    else if (input === "q") onQuit();
  });

  const tally = summarize(data.report);
  const ccInstalled = data.agents.some((a) => a.id === "claude-code" && a.installed);

  const agentOptions: Choice<string>[] = data.agents.map((a) => ({
    value: a.id,
    label: `${a.installed ? "●" : "○"} ${a.name}`,
    hint: a.summary,
  }));

  const actionOptions: Choice<string>[] = [
    ...(ccInstalled ? [{ value: "launch", label: "Launch Claude Code here", hint: "handoff" }] : []),
    { value: "config", label: "Configure this project" },
    { value: "fix", label: "Fix pending items" },
    { value: "dogfood", label: "Set up dogfood" },
    { value: "refresh", label: "Refresh" },
    { value: "quit", label: "Quit" },
  ];

  const onAction = (value: string): void => {
    if (value === "launch") onLaunch();
    else if (value === "refresh") onRefresh();
    else if (value === "quit") onQuit();
    else onNavigate(value as Route);
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
        <Box flexDirection="column" width="52%">
          <Panel title={focus === "agents" ? "AI agents  ·  enter to detail" : "AI agents"} color={focus === "agents" ? "cyan" : "gray"}>
            <SelectList options={agentOptions} index={agentIndex} onMove={onAgentMove} onSelect={onOpenAgent} isFocused={focus === "agents"} />
          </Panel>
          <Panel title="Actions" color={focus === "actions" ? "cyan" : "gray"}>
            <SelectList options={actionOptions} index={actionIndex} onMove={setActionIndex} onSelect={onAction} isFocused={focus === "actions"} />
          </Panel>
        </Box>

        <Box flexDirection="column" width="48%">
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

      <Text dimColor>{`  tab switch panel · ↑↓ move · enter select · q quit`}</Text>
    </Box>
  );
}

// ── Agent detail ────────────────────────────────────────────────────────────

interface DetailItem {
  key: string;
  title: string;
  description?: string;
  color: string;
}

const PER_PAGE = 6;

export function AgentDetail({ cc, onBack, onQuit }: { cc: ClaudeCodeOverview; onBack: () => void; onQuit: () => void }) {
  const [page, setPage] = useState(0);

  const items: DetailItem[] = [
    ...cc.commands.map((c) => ({ key: `cmd:${c.name}`, title: `/${c.name}`, color: "green", ...(c.description ? { description: c.description } : {}) })),
    ...cc.skills.map((s) => ({ key: `skill:${s.source}:${s.name}`, title: s.name, color: "magenta", ...(s.description ? { description: s.description } : {}) })),
  ];
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const slice = items.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  useInput((input, key) => {
    if (input === "b" || key.escape || key.leftArrow) onBack();
    else if (input === "q") onQuit();
    else if (input === "n" || key.rightArrow) setPage((p) => Math.min(pages - 1, p + 1));
    else if (input === "p") setPage((p) => Math.max(0, p - 1));
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">{` Claude Code · detail ${cc.installed ? "" : "(not installed) "}`}</Text>
      <Text dimColor>{`${cc.mcps.length} MCP · ${cc.plugins.length} plugins · ${cc.commands.length} commands · ${cc.skills.length} skills`}</Text>
      <Box flexWrap="wrap">
        {slice.map((it) => (
          <Box key={it.key} width="50%" paddingRight={1}>
            <Card title={it.title} color={it.color} {...(it.description ? { description: it.description } : {})} />
          </Box>
        ))}
      </Box>
      <Text dimColor>{`page ${current + 1}/${pages}  ·  n/p page · b back · q quit`}</Text>
    </Box>
  );
}
