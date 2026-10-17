import { describe, expect, it } from "vitest";
import { defaultEngineRegistry } from "./default-registry.js";
import { EngineNotSupportedError } from "./types.js";

describe("defaultEngineRegistry", () => {
  it("registers the three known engines", () => {
    expect(defaultEngineRegistry().list().map((a) => a.id)).toEqual(["claude-code", "codex", "opencode"]);
  });

  it("stub engines throw EngineNotSupportedError on build", () => {
    const reg = defaultEngineRegistry();
    const opts = { prompt: "x", cwd: "/tmp", mcpConfigPath: "/tmp/m.json" };
    expect(() => reg.get("codex").buildHeadlessCommand(opts)).toThrow(EngineNotSupportedError);
    expect(() => reg.get("opencode").buildHeadlessCommand(opts)).toThrow(EngineNotSupportedError);
  });

  it("claude-code builds a real command", () => {
    const cmd = defaultEngineRegistry().get("claude-code").buildHeadlessCommand({ prompt: "x", cwd: "/tmp", mcpConfigPath: "/tmp/m.json" });
    expect(cmd.bin).toBe("claude");
  });
});
