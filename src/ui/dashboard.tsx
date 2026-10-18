// Dashboard views (presentational) — the home overview and the per-agent detail.
// Stateful orchestration (routing, data, launch) lives in app.tsx.

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Logo, Panel, Icon, Card } from "./components/index.js";
import type { Check, CheckStatus, EnvironmentReport } from "./../core/env/types.js";
import { summarize } from "./../core/env/types.js";
import type { ClaudeCodeOverview } from "../core/env/claude-code.js";

export type Route = "home" | "detail" | "config" | "fix" | "dogfood" | "history" | "rollback" | "run" | "settings" | "provision" | "skills" | "flow";

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
  hasHistory: boolean;
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

function NavRow({ active, label, hint, disabled }: { active: boolean; label: string; hint?: string; disabled?: boolean }) {
  return (
    <Box>
      {active ? <Icon name="pointer" color={disabled ? "gray" : "cyan"} /> : <Text> </Text>}
      <Text {...(active && !disabled ? { color: "cyan" } : {})} dimColor={disabled === true} bold={active && !disabled}>{` ${label}`}</Text>
      {hint ? <Text dimColor>{`  ${hint}`}</Text> : null}
    </Box>
  );
}

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
  // One continuous cursor over [agents…, actions…]: a single ">" that starts on the
  // first agent and jumps into the Actions panel as it moves down.
  const ccInstalled = data.agents.some((a) => a.id === "claude-code" && a.installed);
  const actions: { value: string; label: string; hint?: string; disabled?: boolean }[] = [
    { value: "flow", label: "Flow", hint: "end-to-end: SDD → review → PR" },
    { value: "run", label: "Run an agent", hint: "through the gate" },
    { value: "skills", label: "Skills", hint: "the gate's curated skills" },
    { value: "config", label: "Configure this project" },
    { value: "settings", label: "Settings", hint: "gate vs project" },
    { value: "provision", label: "Install / provision", hint: "Ollama · LiteLLM · custom" },
    { value: "fix", label: "Fix pending items" },
    { value: "dogfood", label: "Set up dogfood" },
    { value: "history", label: "History" },
    { value: "rollback", label: "Rollback a change", ...(data.hasHistory ? {} : { disabled: true, hint: "no history yet" }) },
    ...(ccInstalled ? [{ value: "launch", label: "Launch raw (no gate)", hint: "ungoverned" }] : []),
    { value: "refresh", label: "Refresh" },
    { value: "quit", label: "Quit" },
  ];
  const total = data.agents.length + actions.length;
  const [cursor, setCursor] = useState(0);

  const activate = (i: number): void => {
    if (i < data.agents.length) {
      onAgentMove(i);
      onOpenAgent();
      return;
    }
    const action = actions[i - data.agents.length];
    if (!action || action.disabled) return;
    const value = action.value;
    if (value === "launch") onLaunch();
    else if (value === "refresh") onRefresh();
    else if (value === "quit") onQuit();
    else onNavigate(value as Route);
  };

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => (c - 1 + total) % total);
    else if (key.downArrow) setCursor((c) => (c + 1) % total);
    else if (key.return) activate(cursor);
    else if (input === "q") onQuit();
  });

  const tally = summarize(data.report);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Text dimColor>  Your machine at a glance — agents, models and what's configured.</Text>
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
          <Panel title="AI agents  ·  enter to see details">
            {data.agents.map((a, i) => (
              <NavRow key={a.id} active={cursor === i} label={`${a.installed ? "●" : "○"} ${a.name}`} hint={a.summary} />
            ))}
          </Panel>
          <Panel title="Actions">
            {actions.map((a, i) => (
              <NavRow key={a.value} active={cursor === data.agents.length + i} label={a.label} {...(a.hint ? { hint: a.hint } : {})} {...(a.disabled ? { disabled: true } : {})} />
            ))}
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

      <Text dimColor>{`  ↑↓ move (across panels) · enter select · q quit`}</Text>
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
      <Text dimColor>  Everything this agent carries — commands, skills and MCP servers.</Text>
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
