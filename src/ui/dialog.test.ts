import { describe, it, expect } from "vitest";
import {
  emptyDialogStack,
  showDialog,
  replaceDialog,
  closeTopDialog,
  clearDialogs,
  topDialog,
  hasDialog,
} from "./dialog.js";

describe("dialog stack", () => {
  it("starts empty", () => {
    const s = emptyDialogStack();
    expect(hasDialog(s)).toBe(false);
    expect(topDialog(s)).toBeNull();
  });

  it("shows and tops", () => {
    const s = showDialog(emptyDialogStack(), { kind: "diff", path: "a.ts" });
    expect(hasDialog(s)).toBe(true);
    expect(topDialog(s)?.kind).toBe("diff");
  });

  it("replaces top", () => {
    let s = showDialog(emptyDialogStack(), { kind: "diff" });
    s = replaceDialog(s, { kind: "timeline" });
    expect(topDialog(s)?.kind).toBe("timeline");
    expect(s.dialogs).toHaveLength(1);
  });

  it("closes top", () => {
    let s = showDialog(emptyDialogStack(), { kind: "a" });
    s = showDialog(s, { kind: "b" });
    s = closeTopDialog(s);
    expect(topDialog(s)?.kind).toBe("a");
    expect(s.dialogs).toHaveLength(1);
  });

  it("clear all", () => {
    let s = showDialog(emptyDialogStack(), { kind: "a" });
    s = showDialog(s, { kind: "b" });
    expect(clearDialogs(s).dialogs).toHaveLength(0);
  });

  it("closeTop on empty is no-op", () => {
    const s = emptyDialogStack();
    expect(closeTopDialog(s).dialogs).toHaveLength(0);
  });
});
