// RunScreen — integrated cockpit: transcript + composer + sidebar coexist on one
// persistent screen. No route transition when a run starts. Phase 30.

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent, EngineRunOptions } from "../core/engine/types.js";
import type { ComposerEngine } from "./run-composer.js";
import { buildRunOptions } from "./run-composer.js";
import { RunLive } from "./run-live.js";
import { RunComposer } from "./run-composer.js";
import type { RunHandle } from "../core/engine/runner.js";
import { startRun } from "../core/engine/runner.js";
import type { EngineRegistry } from "../core/engine/registry.js";
import { readLayout, writeLayout, isSidebarOverlay, effectiveSidebarWidth } from "../core/run/layout-store.js";
import { StatusBar } from "./run/status-bar.js";
import type { RunState } from "./run/status-bar.js";

export interface RunScreenProps {
  engines: ComposerEngine[] | null;
  cwd: string;
  mcpConfigPath: string;
  registry: EngineRegistry;
  preferredEngineId?: string;
  autoPrompt?: string;
  onBack: () => void;
  onQuit: () => void;
}

function controlStateToRunState(s: ControlState): RunState {
  if (s === "RUNNING") return "running";
  if (s === "PAUSED") return "paused";
  if (s === "PASSED") return "passed";
  if (s === "FAILED") return "failed";
  return "idle";
}

export function RunScreen({
  engines,
  cwd,
  mcpConfigPath,
  registry,
  preferredEngineId,
  autoPrompt,
  onBack,
  onQuit,
}: RunScreenProps) {
  const [phase, setPhase] = useState<"compose" | "live">(autoPrompt ? "live" : "compose");
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [state, setState] = useState<ControlState>("IDLE");
  const handleRef = useRef<RunHandle | null>(null);
  const autoStartedRef = useRef(false);
  const startedAt = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [layoutConfig] = useState(() => readLayout());
  const [sidebarOpen, setSidebarOpen] = useState(layoutConfig.sidebarOpen);
  const termCols = process.stdout.columns ?? 80;
  const termRows = process.stdout.rows ?? 24;

  const overlay = isSidebarOverlay(termCols);
  const sidebarWidth = sidebarOpen && !overlay ? effectiveSidebarWidth(termCols, { ...layoutConfig, sidebarOpen }) : 0;

  // Elapsed timer while running
  useEffect(() => {
    if (state !== "RUNNING") return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Auto-start when autoPrompt provided
  useEffect(() => {
    if (!autoPrompt || !engines || autoStartedRef.current) return;
    const target = engines.find((e) => e.id === preferredEngineId && e.installed && e.supported)
      ?? engines.find((e) => e.installed && e.supported);
    if (target) {
      autoStartedRef.current = true;
      doStart(target.id, { prompt: autoPrompt, cwd, mcpConfigPath });
    }
  }, [engines, autoPrompt]);

  // Persist sidebar state on change
  useEffect(() => {
    writeLayout({ ...layoutConfig, sidebarOpen });
  }, [sidebarOpen]);

  function doStart(engineId: string, options: EngineRunOptions): void {
    setEvents([]);
    setState("IDLE");
    startedAt.current = Date.now();
    setElapsedMs(0);
    setPhase("live");
    handleRef.current = startRun(registry.get(engineId), options, {
      onEvent: (ev) => setEvents((prev) => [...prev, ev]),
      onState: (s) => setState(s),
    });
  }

  // Global keys
  useInput((_input: string, key: Key) => {
    if (key.ctrl && _input === "s") {
      setSidebarOpen((v) => !v);
    }
    if (key.ctrl && _input === "q") {
      if (!isTerminal(state)) handleRef.current?.cancel();
      onQuit();
    }
  });

  const runState: RunState = controlStateToRunState(state);

  // Find a usable model label from events (text field of system events) or engines list
  const modelLabel = events.findLast?.((e) => e.kind === "system" && e.text)?.text
    ?? (engines?.find((e) => e.installed && e.supported)?.name ?? "claude");

  // Derive token counts from events
  const usage = useMemo(() => {
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheRead = 0;
    for (const ev of events) {
      if (ev.kind === "usage" && ev.usage) {
        tokensIn = ev.usage.tokensIn;
        tokensOut = ev.usage.tokensOut;
        cacheRead = ev.usage.cacheRead;
      }
    }
    const cacheHit = tokensIn > 0 ? cacheRead / tokensIn : undefined;
    return { tokensIn, tokensOut, cacheHit };
  }, [events]);

  return (
    <Box flexDirection="column" height={termRows}>
      <StatusBar
        model={modelLabel}
        tokensIn={usage.tokensIn}
        tokensOut={usage.tokensOut}
        {...(usage.cacheHit !== undefined ? { cacheHit: usage.cacheHit } : {})}
        elapsedMs={elapsedMs}
        state={runState}
      />
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1}>
          {phase === "live" ? (
            <RunLive
              events={events}
              state={state}
              onCancel={() => handleRef.current?.cancel()}
              onBack={onBack}
            />
          ) : engines ? (
            <RunComposer
              engines={engines}
              cwd={cwd}
              mcpConfigPath={mcpConfigPath}
              {...(preferredEngineId ? { preferredEngineId } : {})}
              onRun={(engineId, options) => doStart(engineId, options)}
              onBack={onBack}
              onQuit={onQuit}
            />
          ) : (
            <Box paddingX={1}>
              <Text dimColor>detecting engines…</Text>
            </Box>
          )}
        </Box>
        {sidebarOpen && !overlay && sidebarWidth > 0 && (
          <Box width={sidebarWidth} flexDirection="column" borderStyle="single" borderLeft>
            <Text dimColor>ctrl+s sidebar</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
