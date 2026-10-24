// PURE layered keymap stack. Layers are pushed/popped; resolveKey walks top-down
// and stops at the first match. Each layer defines bindings from key string to action.

export type KeyAction = string;

export interface KeyBinding {
  /** Key representation, e.g. "ctrl+s", "j", "\x1b[A" (up arrow). */
  key: string;
  label: string;
  action: KeyAction;
}

export type LayerName = "global" | "normal" | "composer" | "gate-decision";

export interface Layer {
  name: LayerName;
  bindings: KeyBinding[];
}

export interface KeymapStack {
  layers: Layer[];
}

// ── Predefined layers ────────────────────────────────────────────────────────

export const GLOBAL_LAYER: Layer = {
  name: "global",
  bindings: [
    { key: "ctrl+s", label: "toggle sidebar", action: "sidebar-toggle" },
    { key: "ctrl+k", label: "toggle composer", action: "composer-toggle" },
    { key: "ctrl+q", label: "quit", action: "quit" },
    { key: "ctrl+p", label: "command palette", action: "palette-open" },
  ],
};

export const NORMAL_LAYER: Layer = {
  name: "normal",
  bindings: [
    { key: "j", label: "scroll down", action: "scroll-down" },
    { key: "k", label: "scroll up", action: "scroll-up" },
    { key: "g", label: "go to top", action: "scroll-top" },
    { key: "G", label: "go to bottom", action: "scroll-bottom" },
    { key: "n", label: "next message", action: "nav-next" },
    { key: "N", label: "prev message", action: "nav-prev" },
    { key: "e", label: "expand/collapse", action: "expand-toggle" },
    { key: "v", label: "cycle verbosity", action: "verbosity-cycle" },
    { key: "f", label: "fork session", action: "fork" },
    { key: "\x1b[A", label: "scroll up", action: "scroll-up" },
    { key: "\x1b[B", label: "scroll down", action: "scroll-down" },
  ],
};

export const COMPOSER_LAYER: Layer = {
  name: "composer",
  bindings: [
    { key: "ctrl+j", label: "send prompt", action: "composer-send" },
    { key: "esc", label: "collapse composer", action: "composer-toggle" },
    { key: "ctrl+f", label: "attach file", action: "composer-attach" },
    { key: "ctrl+m", label: "select model", action: "composer-model" },
    { key: "\x1b[C", label: "next tab", action: "tab-next" },
    { key: "\x1b[D", label: "prev tab", action: "tab-prev" },
  ],
};

export const GATE_DECISION_LAYER: Layer = {
  name: "gate-decision",
  bindings: [
    { key: "a", label: "approve gate", action: "gate-approve" },
    { key: "d", label: "deny gate", action: "gate-deny" },
    { key: "r", label: "request revision", action: "gate-revise" },
  ],
};

// ── Stack operations ─────────────────────────────────────────────────────────

export function emptyStack(): KeymapStack {
  return { layers: [GLOBAL_LAYER, NORMAL_LAYER] };
}

export function pushLayer(stack: KeymapStack, layer: Layer): KeymapStack {
  return { layers: [...stack.layers, layer] };
}

export function popLayer(stack: KeymapStack): KeymapStack {
  if (stack.layers.length <= 1) return stack;
  return { layers: stack.layers.slice(0, -1) };
}

export function replaceTopLayer(stack: KeymapStack, layer: Layer): KeymapStack {
  const without = popLayer(stack);
  return pushLayer(without, layer);
}

/**
 * Resolve a key string to an action by walking layers top-to-bottom.
 * Returns the first matching action, or null.
 */
export function resolveKey(stack: KeymapStack, key: string): KeyAction | null {
  for (let i = stack.layers.length - 1; i >= 0; i--) {
    const layer = stack.layers[i]!;
    const binding = layer.bindings.find((b) => b.key === key);
    if (binding) return binding.action;
  }
  return null;
}

/** All bindings in the stack, top layer first, deduped by action label. */
export function activeBindings(stack: KeymapStack): KeyBinding[] {
  const seen = new Set<string>();
  const result: KeyBinding[] = [];
  for (let i = stack.layers.length - 1; i >= 0; i--) {
    for (const b of stack.layers[i]!.bindings) {
      if (!seen.has(b.action)) {
        seen.add(b.action);
        result.push(b);
      }
    }
  }
  return result;
}

/** Encode an Ink key event to a canonical key string for resolveKey. */
export function encodeKey(input: string, key: { ctrl?: boolean; escape?: boolean; return?: boolean }): string {
  if (key.escape) return "esc";
  if (key.return) return "return";
  if (key.ctrl && input) return `ctrl+${input}`;
  return input;
}
