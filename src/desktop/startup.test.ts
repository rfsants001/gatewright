// Regression guard for the Electron startup hang (Codex validation, 14/11/2026).
//
// A top-level `await app.whenReady()` at module scope stalled ESM evaluation and
// the `ready` event never fired, so no window was created. The fix is to register
// the handler non-blockingly: `void app.whenReady().then(() => createWindow())`.
// This guard keeps that shape from regressing. (A live renderer-ready smoke needs a
// real graphical session — see CODEX-VALIDATION.md.)

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("../../desktop/main.mjs", import.meta.url));

describe("electron main — startup wiring", () => {
  const source = readFileSync(MAIN, "utf8");

  it("registers whenReady() non-blockingly (no top-level await)", () => {
    expect(source).toMatch(/app\.whenReady\(\)\s*\.then\(/);
    // A top-level (non-nested) `await app.whenReady()` is the exact bug that hung startup.
    expect(source).not.toMatch(/^\s*await\s+app\.whenReady\(\)/m);
  });

  it("creates the window and suppresses the native menu on ready", () => {
    expect(source).toMatch(/createWindow\(\)/);
    expect(source).toMatch(/Menu\.setApplicationMenu\(null\)/);
  });
});
