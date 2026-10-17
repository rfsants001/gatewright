import { describe, expect, it } from "vitest";
import { gateHookCommand, gateServeInvocation, isGateHookCommand } from "./gate-bin.js";

describe("gate-bin", () => {
  it("hook command is an absolute node invocation (no PATH dependency)", () => {
    const cmd = gateHookCommand();
    expect(cmd).toContain("gate.js");
    expect(cmd).toContain("hook");
    expect(cmd).not.toBe("gate hook");
  });

  it("serve invocation runs the CLI via node with the serve arg", () => {
    const inv = gateServeInvocation();
    expect(inv.args).toContain("serve");
    expect(inv.args[0]).toContain("gate.js");
  });

  it("recognizes both the bare and absolute hook commands", () => {
    expect(isGateHookCommand("gate hook")).toBe(true);
    expect(isGateHookCommand(gateHookCommand())).toBe(true);
    expect(isGateHookCommand("some other command")).toBe(false);
    expect(isGateHookCommand(undefined)).toBe(false);
  });
});
