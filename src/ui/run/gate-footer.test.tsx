import { describe, it, expect } from "vitest";
import { formatGateLine, type GateStatus } from "./gate-footer.js";

describe("formatGateLine", () => {
  it("renders passed gate with ✓", () => {
    const gates: GateStatus[] = [{ name: "secret", state: "passed" }];
    expect(formatGateLine(gates)).toBe("secret ✓");
  });

  it("renders failed gate with ✗", () => {
    const gates: GateStatus[] = [{ name: "quality", state: "failed" }];
    expect(formatGateLine(gates)).toBe("quality ✗");
  });

  it("renders pending gate with ⏳", () => {
    const gates: GateStatus[] = [{ name: "plan", state: "pending" }];
    expect(formatGateLine(gates)).toBe("plan ⏳");
  });

  it("renders running gate with ⏳", () => {
    const gates: GateStatus[] = [{ name: "plan", state: "running" }];
    expect(formatGateLine(gates)).toBe("plan ⏳");
  });

  it("renders not-fired gate with —", () => {
    const gates: GateStatus[] = [{ name: "completion", state: "not-fired" }];
    expect(formatGateLine(gates)).toBe("completion —");
  });

  it("renders multiple gates separated by two spaces", () => {
    const gates: GateStatus[] = [
      { name: "secret", state: "passed" },
      { name: "proportion", state: "passed" },
      { name: "plan", state: "pending" },
      { name: "completion", state: "not-fired" },
    ];
    const line = formatGateLine(gates);
    expect(line).toBe("secret ✓  proportion ✓  plan ⏳  completion —");
  });
});
