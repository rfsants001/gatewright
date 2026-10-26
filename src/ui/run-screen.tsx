// RunScreen — the integrated cockpit (Phase 30). One persistent screen: status bar
// on top, a session rail on the left, the transcript + composer stacked in the
// center pane, and the sidebar on the right. No compose→live route transition: the
// composer is always present and the transcript accumulates turns in place. Panes
// have independent focus (Tab cycles; ctrl+s → sidebar) so their key handlers never
// fight. ctrl+p opens the command palette; `t`/`f` (transcript focus) open dialogs.

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import type { ControlState } from "../core/control/control-state.js";
import { isTerminal } from "../core/control/control-state.js";
import type { EngineEvent, EngineRunOptions } from "../core/engine/types.js";
import type { ComposerEngine } from "./run-composer.js";
import type { RunHandle } from "../core/engine/runner.js";
import { startRun } from "../core/engine/runner.js";
import type { EngineRegistry } from "../core/engine/registry.js";
import { readLayout, writeLayout, isSidebarOverlay, effectiveSidebarWidth } from "../core/run/layout-store.js";
import { projectTurns } from "../core/run/project-turns.js";
import { deriveFileChanges } from "../core/run/file-changes.js";
import { coerceVerbosity } from "../core/run/grouping.js";
import { StatusBar, type RunState } from "./run/status-bar.js";
import { Transcript } from "./run/transcript.js";
import { Composer } from "./run/composer.js";
import { Sidebar } from "./run/sidebar.js";
import { SessionTabs } from "./run/session-tabs.js";
import { CommandPalette } from "./run/command-palette.js";
import { DialogHost } from "./run/dialog-host.js";
import { buildTranscriptRows } from "./run/transcript-rows.js";
import {
  emptyDialogStack,
  showDialog,
  closeTopDialog,
  hasDialog,
  type DialogStack,
} from "./dialog.js";
import { GLOBAL_LAYER, NORMAL_LAYER, COMPOSER_LAYER, activeBindings, type KeymapStack } from "./keymap.js";
import {
  emptySessionStore,
  addSession,
  activateSession,
  activeSession,
  listSessions,
  newSessionId,
  type Session,
} from "../core/run/session-store.js";

const CONTEXT_WINDOW = 200_000;

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

type Focus = "composer" | "transcript" | "sidebar";

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
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [state, setState] = useState<ControlState>("IDLE");
  const [focus, setFocus] = useState<Focus>("composer");
  const [queue, setQueue] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialogStack, setDialogStack] = useState<DialogStack>(() => emptyDialogStack());
  const [sessions, setSessions] = useState(() => {
    const first: Session = { id: newSessionId(), label: "run 1", state: "IDLE", events: [], gates: [] };
    return addSession(emptySessionStore(), first);
  });

  const handleRef = useRef<RunHandle | null>(null);
  const autoStartedRef = useRef(false);
  const startedAt = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  const [layoutConfig] = useState(() => readLayout());
  const [sidebarOpen, setSidebarOpen] = useState(layoutConfig.sidebarOpen);
  const firstUserPrompt = useRef<string>(autoPrompt ?? "");

  const termCols = process.stdout.columns ?? 80;
  const termRows = process.stdout.rows ?? 24;
  const overlay = isSidebarOverlay(termCols);
  const sidebarWidth = sidebarOpen && !overlay ? effectiveSidebarWidth(termCols, { ...layoutConfig, sidebarOpen }) : 0;

  const selectedEngineId = useMemo(() => {
    const list = engines ?? [];
    const pick = list.find((e) => e.id === preferredEngineId && e.installed && e.supported)
      ?? list.find((e) => e.installed && e.supported);
    return pick?.id ?? null;
  }, [engines, preferredEngineId]);

  function doStart(prompt: string): void {
    if (!selectedEngineId) return;
    if (!firstUserPrompt.current) firstUserPrompt.current = prompt;
    const options: EngineRunOptions = { prompt, cwd, mcpConfigPath };
    startedAt.current = Date.now();
    setElapsedMs(0);
    setState("IDLE");
    handleRef.current = startRun(registry.get(selectedEngineId), options, {
      onEvent: (ev) => setEvents((prev) => [...prev, ev]),
      onState: (s) => setState(s),
    });
  }

  function submitPrompt(text: string): void {
    if (!isTerminal(state) && state !== "IDLE") {
      setQueue((q) => [...q, text]); // run in flight → queue it
      return;
    }
    doStart(text);
  }

  // Elapsed timer while running.
  useEffect(() => {
    if (state !== "RUNNING") return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, [state]);

  // Auto-start when an autoPrompt is provided.
  useEffect(() => {
    if (!autoPrompt || !selectedEngineId || autoStartedRef.current) return;
    autoStartedRef.current = true;
    doStart(autoPrompt);
  }, [selectedEngineId]);

  // Drain one queued prompt when the current run finishes.
  useEffect(() => {
    if (!isTerminal(state) || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    if (next) doStart(next);
  }, [state]);

  // Persist sidebar open state.
  useEffect(() => {
    writeLayout({ ...layoutConfig, sidebarOpen });
  }, [sidebarOpen]);

  const runState: RunState = controlStateToRunState(state);
  const modalOpen = paletteOpen || hasDialog(dialogStack);

  const turns = useMemo(
    () => projectTurns(events, firstUserPrompt.current ? { userMessage: firstUserPrompt.current } : {}),
    [events],
  );
  const { rows, groupedRows, turnStarts } = useMemo(
    () => buildTranscriptRows(turns, { model: modelLabel(), cwd, verbosity: coerceVerbosity(undefined) }),
    [turns],
  );
  const usage = useMemo(() => {
    let tokensIn = 0;
    let tokensOut = 0;
    let cacheRead = 0;
    for (const ev of events) {
      if (ev.kind === "usage" && ev.usage) {
        tokensIn += ev.usage.tokensIn;
        tokensOut += ev.usage.tokensOut;
        cacheRead += ev.usage.cacheRead;
      }
    }
    const denom = tokensIn + cacheRead;
    const cacheHit = denom > 0 ? cacheRead / denom : undefined;
    return { tokensIn, tokensOut, cacheHit };
  }, [events]);

  const fileChanges = useMemo(() => deriveFileChanges(events), [events]);

  function modelLabel(): string {
    const list = engines ?? [];
    return list.find((e) => e.id === selectedEngineId)?.name ?? "claude";
  }

  const keymap: KeymapStack = useMemo(
    () => ({ layers: [GLOBAL_LAYER, focus === "composer" ? COMPOSER_LAYER : NORMAL_LAYER] }),
    [focus],
  );
  const shortcutBindings = useMemo(
    () => activeBindings(keymap).map((b) => ({ key: b.key, label: b.label })),
    [keymap],
  );

  function cycleFocus(): void {
    setFocus((f) => {
      if (f === "composer") return "transcript";
      if (f === "transcript") return sidebarOpen && !overlay ? "sidebar" : "composer";
      return "composer";
    });
  }

  // Global keys (always active). Modal layers handle their own keys.
  useInput((input: string, key: Key) => {
    if (modalOpen) return;
    if (key.tab) { cycleFocus(); return; }
    if (key.ctrl && input === "s") { setSidebarOpen((v) => !v); return; }
    if (key.ctrl && input === "p") { setPaletteOpen(true); return; }
    if (key.ctrl && input === "q") {
      if (!isTerminal(state)) handleRef.current?.cancel();
      onQuit();
      return;
    }
    if (key.ctrl && input === "b") { onBack(); return; }
    if (focus === "transcript") {
      if (input === "t") { setDialogStack((s) => showDialog(s, { kind: "timeline" })); return; }
      if (input === "f") { setDialogStack((s) => showDialog(s, { kind: "fork", turnIndex: 0 })); return; }
    }
  });

  function runPaletteAction(action: string): void {
    setPaletteOpen(false);
    switch (action) {
      case "sidebar-toggle": setSidebarOpen((v) => !v); break;
      case "quit":
        if (!isTerminal(state)) handleRef.current?.cancel();
        onQuit();
        break;
      case "composer-toggle": setFocus("composer"); break;
      default: break;
    }
  }

  const closeTop = (): void => setDialogStack((s) => closeTopDialog(s));

  const sessionList = listSessions(sessions);
  const active = activeSession(sessions);

  return (
    <Box flexDirection="column" height={termRows}>
      <StatusBar
        model={modelLabel()}
        tokensIn={usage.tokensIn}
        tokensOut={usage.tokensOut}
        {...(usage.cacheHit !== undefined ? { cacheHit: usage.cacheHit } : {})}
        elapsedMs={elapsedMs}
        state={runState}
      />
      <Box flexDirection="row" flexGrow={1}>
        {sessionList.length > 0 && (
          <SessionTabs
            sessions={sessionList}
            activeId={active?.id ?? null}
            onActivate={(id) => setSessions((s) => activateSession(s, id))}
            onNew={() => setSessions((s) => {
              const sess: Session = {
                id: newSessionId(),
                label: `run ${listSessions(s).length + 1}`,
                state: "IDLE",
                events: [],
                gates: [],
              };
              return activateSession(addSession(s, sess), sess.id);
            })}
          />
        )}
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="column" flexGrow={1}>
            {paletteOpen ? (
              <CommandPalette stack={keymap} onExecute={runPaletteAction} onClose={() => setPaletteOpen(false)} />
            ) : hasDialog(dialogStack) ? (
              <DialogHost stack={dialogStack} onClose={closeTop} turns={turns} />
            ) : rows.length > 0 ? (
              <Transcript
                rows={rows}
                groupedRows={groupedRows}
                turnStarts={turnStarts}
                termRows={termRows}
                live={state === "RUNNING"}
                isActive={focus === "transcript"}
              />
            ) : (
              <Box paddingX={1}><Text dimColor>{engines ? "type a prompt below to start a run" : "detecting engines…"}</Text></Box>
            )}
          </Box>
          {!modalOpen && (
            <Composer
              onSubmit={submitPrompt}
              onQuit={onQuit}
              live={state === "RUNNING"}
              {...(engines ? { models: engines.filter((e) => e.installed && e.supported).map((e) => e.name) } : {})}
              queuedCount={queue.length}
              isActive={focus === "composer"}
            />
          )}
        </Box>
        {sidebarOpen && !overlay && sidebarWidth > 0 && (
          <Sidebar
            width={sidebarWidth}
            runState={runState}
            model={modelLabel()}
            fileChanges={fileChanges}
            gates={[]}
            contextUsed={usage.tokensIn + usage.tokensOut}
            contextTotal={CONTEXT_WINDOW}
            turnCount={turns.length}
            keyBindings={shortcutBindings}
            isActive={focus === "sidebar"}
          />
        )}
      </Box>
    </Box>
  );
}
