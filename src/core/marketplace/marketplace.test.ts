import { describe, expect, it } from "vitest";
import { GateRegistry } from "../gate/registry.js";
import { ValidatorRegistry } from "../validators/registry.js";
import type { Gate } from "../gate/types.js";
import type { Validator } from "../validators/types.js";
import { validateGateContract, validateValidatorContract } from "./contract.js";
import { registerFromPackage, type GatePackageManifest } from "./package.js";

const goodGate: Gate = {
  name: "third-party-gate",
  description: "example",
  events: ["stop"],
  appliesTo: (ctx) => ctx.event === "stop",
  check: () => ({ kind: "allow" }),
};

const goodValidator: Validator = { id: "third-party-validator", validate: () => ({ ok: true, findings: [] }) };

describe("contract validation", () => {
  it("accepts a well-formed gate / validator", () => {
    expect(validateGateContract(goodGate).ok).toBe(true);
    expect(validateValidatorContract(goodValidator).ok).toBe(true);
  });

  it("reports precise problems for malformed candidates", () => {
    const g = validateGateContract({ name: "", events: [], check: 1 });
    expect(g.ok).toBe(false);
    expect(g.problems).toEqual(expect.arrayContaining([expect.stringContaining("name"), expect.stringContaining("events"), expect.stringContaining("appliesTo")]));
    expect(validateValidatorContract({ id: "x" }).ok).toBe(false); // missing validate
    expect(validateValidatorContract("nope").ok).toBe(false);
  });
});

describe("registerFromPackage", () => {
  const gateManifest: GatePackageManifest = { name: "pkg-gate", version: "1.0.0", kind: "gate" };
  const validatorManifest: GatePackageManifest = { name: "pkg-val", version: "1.0.0", kind: "validator" };

  it("registers a valid gate into the gate registry", () => {
    const gate = new GateRegistry();
    expect(registerFromPackage(gateManifest, goodGate, { gate })).toEqual({ ok: true });
    expect(gate.list().map((x) => x.name)).toContain("third-party-gate");
  });

  it("registers a valid validator into the validator registry", () => {
    const validator = new ValidatorRegistry();
    expect(registerFromPackage(validatorManifest, goodValidator, { validator })).toEqual({ ok: true });
    expect(validator.get("third-party-validator")).toBeDefined();
  });

  it("rejects an invalid candidate and registers nothing", () => {
    const gate = new GateRegistry();
    const res = registerFromPackage(gateManifest, { name: "broken" }, { gate });
    expect(res.ok).toBe(false);
    expect(gate.list()).toHaveLength(0);
  });

  it("rejects when the matching registry is absent", () => {
    expect(registerFromPackage(gateManifest, goodGate, {})).toEqual({ ok: false, problems: ["no gate registry provided"] });
  });
});
