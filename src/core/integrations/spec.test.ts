import { describe, expect, it } from "vitest";
import { parseIntegrationSpec } from "./spec.js";

describe("parseIntegrationSpec", () => {
  it("accepts a valid spec with endpoint", () => {
    const spec = parseIntegrationSpec({
      kind: "advisor",
      endpoint: "http://localhost:9000",
      intent: "Replace Jev with an external advisor for judgment gates",
    });
    expect(spec.kind).toBe("advisor");
    expect(spec.endpoint).toBe("http://localhost:9000");
    expect(spec.package).toBeUndefined();
    expect(spec.intent).toContain("advisor");
  });

  it("accepts a valid spec with package", () => {
    const spec = parseIntegrationSpec({
      kind: "mcp",
      package: "@company/mcp-server",
      intent: "Wire a custom MCP server as a module",
    });
    expect(spec.kind).toBe("mcp");
    expect(spec.package).toBe("@company/mcp-server");
    expect(spec.endpoint).toBeUndefined();
  });

  it("accepts a valid spec with both endpoint and package", () => {
    const spec = parseIntegrationSpec({
      kind: "model",
      endpoint: "http://ollama:11434",
      package: "ollama-bridge",
      intent: "Local model via Ollama",
    });
    expect(spec.endpoint).toBe("http://ollama:11434");
    expect(spec.package).toBe("ollama-bridge");
  });

  it("throws when neither endpoint nor package is provided", () => {
    expect(() =>
      parseIntegrationSpec({
        kind: "advisor",
        intent: "No location provided",
      }),
    ).toThrow(/endpoint or package/);
  });

  it("throws on an invalid kind", () => {
    expect(() =>
      parseIntegrationSpec({
        kind: "unknown-kind",
        endpoint: "http://localhost:9000",
        intent: "Some intent",
      }),
    ).toThrow();
  });

  it("throws when intent is empty", () => {
    expect(() =>
      parseIntegrationSpec({
        kind: "advisor",
        endpoint: "http://localhost:9000",
        intent: "",
      }),
    ).toThrow(/intent/);
  });

  it("throws when intent is missing entirely", () => {
    expect(() =>
      parseIntegrationSpec({
        kind: "advisor",
        endpoint: "http://localhost:9000",
      }),
    ).toThrow();
  });
});
