import { describe, expect, it } from "vitest";
import { errorClassifier } from "./error-classifier.js";

const g = errorClassifier();
const decide = (tr: unknown) => g.check({ event: "post-bash", cwd: "/x", toolResponse: tr });

describe("error-classifier", () => {
  it("classifies known failure signatures", () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ stderr: "Error: Cannot find module 'x'" }, "Module not found"],
      [{ stderr: "zsh: command not found: pnpm" }, "Missing command"],
      [{ stdout: "src/a.ts(3,1): error TS2345: bad" }, "TypeScript type error"],
      [{ stderr: "EACCES: permission denied" }, "Permission denied"],
      [{ stderr: "ENOENT: no such file or directory" }, "No such file"],
      [{ stderr: "Request failed 401 unauthorized" }, "Authentication failure"],
      [{ stderr: "status: 503 service unavailable" }, "Remote server error"],
      [{ stderr: "CONFLICT (content): Merge conflict" }, "Git error"],
      [{ stdout: "Tests: 2 failed, 1 passed" }, "Failing tests" ],
    ];
    for (const [tr, needle] of cases) {
      const d = decide(tr);
      expect(d.kind).toBe("advise");
      if (d.kind === "advise") expect(d.message).toContain(needle);
    }
  });

  it("stays silent on benign output and non-5xx numbers", () => {
    expect(decide({ stdout: "Build succeeded, 0 errors" }).kind).toBe("allow");
    expect(decide({ stdout: "500 records processed" }).kind).toBe("allow");
    expect(decide({ stdout: "all tests passed" }).kind).toBe("allow");
    expect(decide({}).kind).toBe("allow");
  });
});
