import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyOnEdit } from "./verify-on-edit.js";

const g = verifyOnEdit();

describe("verify-on-edit", () => {
  let dir: string;
  const decide = (file: string) => g.check({ event: "post-edit", cwd: dir, toolInput: { file_path: join(dir, file) } });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-voe-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("advises on merge-conflict markers", () => {
    writeFileSync(join(dir, "c.ts"), "const a=1;\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\n");
    const d = decide("c.ts");
    expect(d.kind).toBe("advise");
    if (d.kind === "advise") expect(d.message).toContain("merge-conflict");
  });

  it("advises on a stray debugger", () => {
    writeFileSync(join(dir, "d.ts"), "function f(){ debugger; return 1 }\n");
    const d = decide("d.ts");
    expect(d.kind).toBe("advise");
    if (d.kind === "advise") expect(d.message).toContain("debugger");
  });

  it("nudges for a missing co-located test", () => {
    writeFileSync(join(dir, "clean.ts"), "export const clean = 42;\n");
    const d = decide("clean.ts");
    expect(d.kind).toBe("advise");
    if (d.kind === "advise") expect(d.message).toContain("test-reminder");
  });

  it("is silent when a co-located test exists", () => {
    writeFileSync(join(dir, "api.ts"), "export const api = 1;\n");
    writeFileSync(join(dir, "api.test.ts"), "test\n");
    expect(decide("api.ts").kind).toBe("allow");
  });

  it("ignores non-source files and the test file itself", () => {
    writeFileSync(join(dir, "doc.md"), "readme\n");
    writeFileSync(join(dir, "x.test.ts"), "test\n");
    expect(decide("doc.md").kind).toBe("allow");
    expect(decide("x.test.ts").kind).toBe("allow");
  });
});
