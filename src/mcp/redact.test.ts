import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("passes through primitives unchanged", () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBe(null);
  });

  it("passes allowed string values unchanged", () => {
    expect(redact("sonnet")).toBe("sonnet");
    expect(redact("medium")).toBe("medium");
  });

  it("redacts string values that look like secrets", () => {
    expect(redact("sk-abc123")).toBe("[REDACTED]");
    expect(redact("ghp_abc")).toBe("[REDACTED]");
    expect(redact("xoxb-token")).toBe("[REDACTED]");
    expect(redact("eyJhbGci")).toBe("[REDACTED]");
    expect(redact("Bearer abc")).toBe("[REDACTED]");
    expect(redact("AKIA1234567890")).toBe("[REDACTED]");
  });

  it("redacts disallowed keys from objects", () => {
    const result = redact({ endpoint: "https://secret.api", model: "sonnet" }) as Record<string, unknown>;
    expect(result["endpoint"]).toBe("[REDACTED]");
    expect(result["model"]).toBe("sonnet");
  });

  it("redacts nested disallowed keys", () => {
    const input = {
      jev: {
        enabled: true,
        endpoint: "https://private.endpoint",
        model: "haiku",
        apiKey: "sk-secret",
      },
    };
    const result = redact(input) as { jev: Record<string, unknown> };
    expect(result["jev"]["enabled"]).toBe(true);
    expect(result["jev"]["model"]).toBe("haiku");
    expect(result["jev"]["endpoint"]).toBe("[REDACTED]");
    expect(result["jev"]["apiKey"]).toBe("[REDACTED]");
  });

  it("handles arrays recursively", () => {
    const input = [
      { id: "pkg-a", installedAt: "2025-01-01", secret: "token_abc" },
    ];
    const result = redact(input) as Array<Record<string, unknown>>;
    expect(result[0]!["id"]).toBe("pkg-a");
    expect(result[0]!["installedAt"]).toBe("2025-01-01");
    expect(result[0]!["secret"]).toBe("[REDACTED]");
  });

  it("redacts API keys and tokens even inside allowed key values", () => {
    // The `version` key is allowed but if the value itself looks like a token, redact it
    const result = redact({ version: "sk-abc" }) as Record<string, unknown>;
    expect(result["version"]).toBe("[REDACTED]");
  });

  it("passes through env-like keys that are not in allow-list", () => {
    const result = redact({
      ANTHROPIC_API_KEY: "sk-abc",
      HOME: "/home/user",
    }) as Record<string, unknown>;
    expect(result["ANTHROPIC_API_KEY"]).toBe("[REDACTED]");
    expect(result["HOME"]).toBe("[REDACTED]");
  });

  it("handles undefined gracefully", () => {
    expect(redact(undefined)).toBeUndefined();
  });

  it("handles deeply nested config", () => {
    const config = {
      defaultEngine: "claude-code",
      verbosity: "medium",
      jev: { enabled: false, model: "sonnet" },
      packages: [{ id: "graphify", installedAt: "2025-01-01", version: "1.0.0" }],
    };
    const result = redact(config) as Record<string, unknown>;
    expect(result["defaultEngine"]).toBe("claude-code");
    expect(result["verbosity"]).toBe("medium");
    const jev = result["jev"] as Record<string, unknown>;
    expect(jev["enabled"]).toBe(false);
    expect(jev["model"]).toBe("sonnet");
    const pkgs = result["packages"] as Array<Record<string, unknown>>;
    expect(pkgs[0]!["id"]).toBe("graphify");
  });
});
