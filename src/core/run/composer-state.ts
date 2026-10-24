// PURE composer state: slash command filtering, prompt queue, file attach pills,
// tab selection, and model selector. No React, no I/O.

export type ComposerTab = "Prompt" | "Context" | "Gates";

export interface SlashCommand {
  name: string;
  description: string;
}

export interface ComposerState {
  activeTab: ComposerTab;
  attachedFiles: string[];
  queuedPrompts: string[];
  selectedModel: string | null;
  slashQuery: string | null;
}

export function defaultComposerState(): ComposerState {
  return {
    activeTab: "Prompt",
    attachedFiles: [],
    queuedPrompts: [],
    selectedModel: null,
    slashQuery: null,
  };
}

/** Filter slash commands by query (case-insensitive prefix match on name). */
export function slashFilter(query: string, commands: SlashCommand[]): SlashCommand[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(q));
}

/** Add a prompt to the queue (for when the run is RUNNING). */
export function enqueuePrompt(state: ComposerState, prompt: string): ComposerState {
  return { ...state, queuedPrompts: [...state.queuedPrompts, prompt] };
}

/** Drain the first queued prompt (call when run becomes idle). Returns [prompt, newState] or null. */
export function drainQueue(state: ComposerState): [string, ComposerState] | null {
  const [first, ...rest] = state.queuedPrompts;
  if (first === undefined) return null;
  return [first, { ...state, queuedPrompts: rest }];
}

/** Add a file path pill. */
export function attachFile(state: ComposerState, path: string): ComposerState {
  if (state.attachedFiles.includes(path)) return state;
  return { ...state, attachedFiles: [...state.attachedFiles, path] };
}

/** Remove a file path pill by index. */
export function removeFile(state: ComposerState, index: number): ComposerState {
  return { ...state, attachedFiles: state.attachedFiles.filter((_, i) => i !== index) };
}

/** Switch to the next/prev tab. */
export function cycleTab(state: ComposerState, direction: 1 | -1): ComposerState {
  const TABS: ComposerTab[] = ["Prompt", "Context", "Gates"];
  const idx = TABS.indexOf(state.activeTab);
  const next = TABS[(idx + direction + TABS.length) % TABS.length]!;
  return { ...state, activeTab: next };
}

/** Set the selected model (null = use default). */
export function selectModel(state: ComposerState, model: string | null): ComposerState {
  return { ...state, selectedModel: model };
}
