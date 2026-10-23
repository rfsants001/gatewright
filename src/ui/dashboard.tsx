import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, Badge, Icon, Card } from "./components/index.js";
import { HINTS_QUIT } from "./components/index.js";
import { SplitView } from "./components/split-view.js";
import { useTerminalSize } from "./hooks/use-terminal-size.js";
import { statusColor } from "./theme.js";
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

function checkStatusColor(status: CheckStatus): string {
  return statusColor(status === "ok" ? "ok" : status === "warn" ? "warn" : "bad");
}

function groupChecks(report: EnvironmentReport, title: string): Check[] {
  return report.groups.find((g) => g.title === title)?.checks ?? [];
}

function CheckRow({ check }: { check: Check }) {
  const color = checkStatusColor(check.status);
  const icon = check.status === "ok" ? "ok" : check.status === "warn" ? "warn" : "bad";
  return (
    <Box gap={1}>
      <Icon name={icon} color={color} />
      <Text>{check.label}</Text>
      {check.detail ? <Text dimColor>{check.detail}</Text> : null}
    </Box>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

interface ActionDef {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

function NavRow({ active, label, hint, disabled }: { active: boolean; label: string; hint?: string; disabled?: boolean }) {
  return (
    <Box>
      {active ? <Icon name="pointer" color={disabled ? "gray" : "cyan"} /> : <Text> </Text>}
      <Text {...(active && !disabled ? { color: "cyan" } : {})} dimColor={disabled === true} bold={active && !disabled}>{` ${label}`}</Text>
      {hint ? <Text dimColor>{`  ${hint}`}</Text> : null}
    </Box>
  );
}

// ── HomeView ──────────────────────────────────────────────────────────────────

const ACTION_GROUPS: { title: string; values: string[] }[] = [
  { title: "Run", values: ["flow", "run"] },
  { title: "Manage", values: ["skills", "config", "settings", "provision"] },
  { title: "System", values: ["fix", "dogfood", "history", "rollback"] },
  { title: "Navigation", values: ["launch", "refresh", "quit"] },
];

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
  const ccInstalled = data.agents.some((a) => a.id === "claude-code" && a.installed);
  const { mode } = useTerminalSize();

  const actions: ActionDef[] = [
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

  // ── Grouped action list rendering ────────────────────────────────────────
  const actionList = (
    <Box flexDirection="column">
      {/* Agent rows */}
      {data.agents.map((a, i) => (
        <NavRow key={a.id} active={cursor === i} label={`${a.installed ? "●" : "○"} ${a.name}`} hint={a.summary} />
      ))}
      {/* Action groups */}
      {ACTION_GROUPS.map((group) => {
        const groupActions = actions.filter((a) => group.values.includes(a.value));
        if (groupActions.length === 0) return null;
        return (
          <Box key={group.title} flexDirection="column" marginTop={1}>
            <Text dimColor bold>{`  ${group.title}`}</Text>
            {groupActions.map((a) => {
              const globalIdx = data.agents.length + actions.indexOf(a);
              return (
                <NavRow
                  key={a.value}
                  active={cursor === globalIdx}
                  label={a.label}
                  {...(a.hint ? { hint: a.hint } : {})}
                  {...(a.disabled ? { disabled: true } : {})}
                />
              );
            })}
          </Box>
        );
      })}
    </Box>
  );

  // ── Health panels ────────────────────────────────────────────────────────
  const healthPanel = (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan"> Local AI </Text>
        {groupChecks(data.report, "Local AI").map((c) => <CheckRow key={c.label} check={c} />)}
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan"> Jev </Text>
        {groupChecks(data.report, "Jev").map((c) => <CheckRow key={c.label} check={c} />)}
      </Box>
      {data.proxies.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan"> Proxies </Text>
          {data.proxies.map((p) => (
            <Box key={p.name} gap={1}>
              <Icon name="bullet" color="cyan" />
              <Text>{p.name}</Text>
              <Text dimColor>{p.value}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <AppFrame breadcrumb="" logoMode hints={[{ key: "↑↓", label: "move" }, { key: "enter", label: "select" }, ...HINTS_QUIT]}>
      <Box gap={2} marginBottom={1}>
        <Badge label={`${tally.ok} ready`} color="green" />
        <Badge label={`${tally.warn} to configure`} color="yellow" dim={tally.warn === 0} />
        <Badge label={`${tally.missing} missing`} color="red" dim={tally.missing === 0} />
      </Box>
      {mode === "compact" ? (
        actionList
      ) : (
        <SplitView
          left={actionList}
          right={healthPanel}
          leftWidth="55%"
          mode={mode}
        />
      )}
    </AppFrame>
  );
}

// ── AgentDetail ───────────────────────────────────────────────────────────────

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
    <AppFrame
      breadcrumb="claude code · detail"
      hints={[{ key: "n/p", label: "page" }, ...HINTS_QUIT, { key: "b/←", label: "back" }]}
    >
      <Text dimColor>{`${cc.mcps.length} MCP · ${cc.plugins.length} plugins · ${cc.commands.length} commands · ${cc.skills.length} skills${cc.installed ? "" : "  (not installed)"}`}</Text>
      <Box flexWrap="wrap" marginTop={1}>
        {slice.map((it) => (
          <Box key={it.key} width="50%" paddingRight={1}>
            <Card title={it.title} color={it.color} {...(it.description ? { description: it.description } : {})} />
          </Box>
        ))}
      </Box>
      <Text dimColor>{`page ${current + 1}/${pages}`}</Text>
    </AppFrame>
  );
}
