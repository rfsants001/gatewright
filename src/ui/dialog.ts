// PURE modal dialog stack. show/replace/clear; esc closes top.

export interface DialogSpec {
  kind: string;
  [key: string]: unknown;
}

export interface DialogStack {
  dialogs: DialogSpec[];
}

export function emptyDialogStack(): DialogStack {
  return { dialogs: [] };
}

/** Push a new dialog on the stack. */
export function showDialog(stack: DialogStack, spec: DialogSpec): DialogStack {
  return { dialogs: [...stack.dialogs, spec] };
}

/** Replace the top dialog (no-op if stack is empty). */
export function replaceDialog(stack: DialogStack, spec: DialogSpec): DialogStack {
  if (stack.dialogs.length === 0) return showDialog(stack, spec);
  return { dialogs: [...stack.dialogs.slice(0, -1), spec] };
}

/** Remove the top dialog (esc). */
export function closeTopDialog(stack: DialogStack): DialogStack {
  if (stack.dialogs.length === 0) return stack;
  return { dialogs: stack.dialogs.slice(0, -1) };
}

/** Clear all dialogs. */
export function clearDialogs(stack: DialogStack): DialogStack {
  return emptyDialogStack();
}

/** Top dialog, or null when stack is empty. */
export function topDialog(stack: DialogStack): DialogSpec | null {
  return stack.dialogs[stack.dialogs.length - 1] ?? null;
}

export function hasDialog(stack: DialogStack): boolean {
  return stack.dialogs.length > 0;
}
