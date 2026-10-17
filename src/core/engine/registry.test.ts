import { describe, expect, it } from "vitest";
import { EngineRegistry } from "./registry.js";
import type { EngineAdapter, EngineAvailability } from "./types.js";

const fake = (id: string, availability: EngineAvailability): EngineAdapter => ({
  id,
  name: id,
  authModel: "inherited-cli",
  detect: async () => availability,
  buildHeadlessCommand: () => ({ bin: id, args: [] }),
  parseStreamLine: () => null,
});

describe("EngineRegistry", () => {
  it("registers, lists in registration order, and gets by id", () => {
    const r = new EngineRegistry()
      .register(fake("claude-code", { installed: true }))
      .register(fake("codex", { installed: false }));
    expect(r.list().map((a) => a.id)).toEqual(["claude-code", "codex"]);
    expect(r.get("claude-code").id).toBe("claude-code");
    expect(r.has("codex")).toBe(true);
  });

  it("throws a clear error for an unknown id", () => {
    const r = new EngineRegistry().register(fake("claude-code", { installed: true }));
    expect(() => r.get("nope")).toThrow(/unknown engine 'nope'/);
  });

  it("detectAll probes every adapter and pairs availability", async () => {
    const r = new EngineRegistry()
      .register(fake("claude-code", { installed: true, loggedIn: true }))
      .register(fake("codex", { installed: false }));
    const detected = await r.detectAll();
    expect(detected.map((d) => [d.adapter.id, d.availability.installed])).toEqual([
      ["claude-code", true],
      ["codex", false],
    ]);
  });
});
