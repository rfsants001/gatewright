// Regression: GUI apps inherit a minimal PATH that omits version-manager shims
// (fnm/nvm/volta) where `claude`, `codex`, etc. live, so detection must recover
// the user's real PATH from a login shell. Hermetic — a fake shell exports a
// PATH to a fake binary; nothing depends on the host's real tools.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PATH_MARK = "__GW_PATH_7f3a__"; // must match probes.ts

describe("defaultCommandProbe — GUI PATH enrichment", () => {
  let dir = "";
  let toolDir = "";
  const origShell = process.env["SHELL"];
  const origPath = process.env["PATH"];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-probe-"));
    toolDir = join(dir, "bin");
    mkdirSync(toolDir);
    // A fake tool reachable ONLY via the (stubbed) login-shell PATH.
    const tool = join(toolDir, "gw-fake-tool");
    writeFileSync(tool, "#!/bin/sh\necho FAKE-OK\n");
    chmodSync(tool, 0o755);
    // A fake login shell that ignores its args and exports a PATH containing toolDir.
    const shell = join(dir, "fake-shell");
    writeFileSync(shell, `#!/bin/sh\nprintf '${PATH_MARK}%s${PATH_MARK}' '${toolDir}'\n`);
    chmodSync(shell, 0o755);
    process.env["SHELL"] = shell;
    process.env["PATH"] = "/gw-nonexistent"; // the tool is NOT on the inherited PATH
  });

  afterEach(() => {
    if (origShell === undefined) delete process.env["SHELL"]; else process.env["SHELL"] = origShell;
    if (origPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = origPath;
    vi.resetModules(); // drop the memoized enriched PATH so the next test recomputes
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")("resolves a binary only present on the login-shell PATH", async () => {
    const { defaultCommandProbe } = await import("./probes.js");
    expect(defaultCommandProbe("gw-fake-tool")).toBe("FAKE-OK");
  });

  it.skipIf(process.platform === "win32")("returns null for a genuinely absent binary", async () => {
    const { defaultCommandProbe } = await import("./probes.js");
    expect(defaultCommandProbe("gw-definitely-absent-xyz")).toBeNull();
  });
});
