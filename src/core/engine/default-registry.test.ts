import { describe, expect, it } from "vitest";
import { defaultEngineRegistry } from "./default-registry.js";

describe("defaultEngineRegistry", () => {
  it("registers the four terminal engines", () => {
    expect(defaultEngineRegistry().list().map((a) => a.id)).toEqual(["claude-code", "codex", "gemini", "opencode"]);
  });

  it("builds a streaming command for each terminal engine", () => {
    const reg = defaultEngineRegistry();
    const opts = { prompt: "x", cwd: "/tmp", mcpConfigPath: "/tmp/m.json" };
    expect(reg.get("codex").buildHeadlessCommand(opts).args).toContain("--json");
    expect(reg.get("gemini").buildHeadlessCommand(opts).args).toContain("stream-json");
    expect(reg.get("opencode").buildHeadlessCommand(opts).args).toContain("json");
  });

  it("claude-code builds a real command", () => {
    const cmd = defaultEngineRegistry().get("claude-code").buildHeadlessCommand({ prompt: "x", cwd: "/tmp", mcpConfigPath: "/tmp/m.json" });
    expect(cmd.bin).toBe("claude");
  });
});
