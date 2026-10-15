import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proportionGate } from "./proportion-gate.js";

function git(cmd: string, cwd: string) {
  execSync(cmd, { cwd, stdio: "ignore" });
}

describe("proportion-gate", () => {
  let dir: string;
  const decide = (opts = {}) => proportionGate(opts).check({ event: "stop", cwd: dir });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-prop-"));
    git("git init -q", dir);
    git("git config user.email t@t", dir);
    git("git config user.name t", dir);
    writeFileSync(join(dir, "README.md"), "base\n");
    git("git add -A", dir);
    git("git commit -qm init", dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows a clean tree", () => {
    expect(decide().kind).toBe("allow");
  });

  it("advises when over the file budget", () => {
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${i}.txt`), "x\n");
    expect(decide().kind).toBe("advise");
  });

  it("denies under enforce when over budget", () => {
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${i}.txt`), "x\n");
    expect(decide({ enforce: true }).kind).toBe("deny");
  });

  it("respects a raised file threshold", () => {
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `f${i}.txt`), "x\n");
    expect(decide({ maxFiles: 100 }).kind).toBe("allow");
  });

  it("allows outside a git repo", () => {
    const plain = mkdtempSync(join(tmpdir(), "gw-nogit-"));
    try {
      expect(proportionGate().check({ event: "stop", cwd: plain }).kind).toBe("allow");
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
