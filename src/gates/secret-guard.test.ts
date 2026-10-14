import { describe, expect, it } from "vitest";
import type { GateContext } from "../core/gate/types.js";
import { secretGuard } from "./secret-guard.js";

const g = secretGuard();
const kind = (event: GateContext["event"], toolInput: Record<string, unknown>) =>
  g.check({ event, cwd: "/x", toolInput }).kind;

describe("secret-guard", () => {
  it("denies reading secret files", () => {
    for (const f of ["/p/.env", "/p/.env.local", "/h/.ssh/id_rsa", "/p/cert.pem"]) {
      expect(kind("pre-read", { file_path: f })).toBe("deny");
    }
  });

  it("allows templates and normal files", () => {
    expect(kind("pre-read", { file_path: "/p/.env.example" })).toBe("allow");
    expect(kind("pre-read", { file_path: "/p/foo.js" })).toBe("allow");
  });

  it("does not apply to writes (writing a secret is legitimate)", () => {
    expect(g.appliesTo({ event: "pre-edit", cwd: "/x", toolInput: { file_path: "/p/.env" } })).toBe(false);
  });

  it("bash: denies reader verbs targeting a secret file", () => {
    expect(kind("pre-bash", { command: "cat .env" })).toBe("deny");
    expect(kind("pre-bash", { command: "base64 ~/.ssh/id_rsa" })).toBe("deny");
  });

  it("bash: allows existence checks, pattern-filter pipes, moves, and redirects", () => {
    for (const command of ["test -f .env", "ls | grep .env", "cp .env /tmp/x", "cat > .env"]) {
      expect(kind("pre-bash", { command })).toBe("allow");
    }
  });
});
