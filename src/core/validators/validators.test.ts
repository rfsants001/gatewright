import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidatorRegistry, ValidatorRegistryError } from "./registry.js";
import { fileExistence, jsonValidity, lineCount, range, stateEnum } from "./atomic/structural.js";
import { countTotals, idUniqueness, markdownStructural, schema, sectionCoverage } from "./atomic/content.js";
import { runStep, StepRegistry, StepRegistryError, type Step } from "./step-registry.js";
import { runWorkflow, WorkflowRegistry } from "./workflow-registry.js";

describe("ValidatorRegistry", () => {
  it("registers, lists id-sorted, rejects duplicates", () => {
    const reg = new ValidatorRegistry().register(jsonValidity()).register(lineCount(10));
    expect(reg.list().map((v) => v.id)).toEqual(["json-validity", "line-count"]);
    expect(() => reg.register(jsonValidity())).toThrow(ValidatorRegistryError);
  });
});

describe("structural validators", () => {
  it("json-validity", () => {
    expect(jsonValidity().validate('{"a":1}').ok).toBe(true);
    expect(jsonValidity().validate("{bad").ok).toBe(false);
  });
  it("line-count", () => {
    expect(lineCount(2).validate("a\nb").ok).toBe(true);
    expect(lineCount(2).validate("a\nb\nc").ok).toBe(false);
  });
  it("range", () => {
    expect(range(1, 5).validate(3).ok).toBe(true);
    expect(range(1, 5).validate(9).ok).toBe(false);
    expect(range(1, 5).validate("x").ok).toBe(false);
  });
  it("state-enum", () => {
    expect(stateEnum(["PENDING", "DONE"]).validate("DONE").ok).toBe(true);
    expect(stateEnum(["PENDING", "DONE"]).validate("NOPE").ok).toBe(false);
  });
});

describe("file-existence", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "gw-val-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("passes for existing path, fails otherwise", () => {
    const f = join(dir, "x.txt");
    writeFileSync(f, "hi");
    expect(fileExistence().validate(f).ok).toBe(true);
    expect(fileExistence().validate(join(dir, "nope")).ok).toBe(false);
  });
});

describe("content validators", () => {
  it("count-totals", () => {
    expect(countTotals().validate({ items: [1, 2], total: 2 }).ok).toBe(true);
    expect(countTotals().validate({ items: [1], total: 2 }).ok).toBe(false);
  });
  it("id-uniqueness", () => {
    expect(idUniqueness().validate([{ id: "a" }, { id: "b" }]).ok).toBe(true);
    const dup = idUniqueness().validate([{ id: "a" }, { id: "a" }]);
    expect(dup.ok).toBe(false);
    expect(dup.findings[0]?.message).toContain("a");
  });
  it("section-coverage", () => {
    const md = "# T\n## Summary\n## Tasks\n";
    expect(sectionCoverage(["Summary", "Tasks"]).validate(md).ok).toBe(true);
    expect(sectionCoverage(["Summary", "Missing"]).validate(md).ok).toBe(false);
  });
  it("markdown-structural", () => {
    expect(markdownStructural().validate("# Title\nbody").ok).toBe(true);
    expect(markdownStructural().validate("no title").ok).toBe(false);
    expect(markdownStructural().validate("# T\n```\nunclosed").ok).toBe(false);
  });
  it("schema", () => {
    const spec = { name: "string", count: "number" } as const;
    expect(schema(spec).validate({ name: "x", count: 1 }).ok).toBe(true);
    expect(schema(spec).validate({ name: "x" }).ok).toBe(false);
    expect(schema(spec).validate({ name: "x", count: "1" }).ok).toBe(false);
  });
});

describe("step + workflow composition", () => {
  const mdStep: Step = { id: "md", validators: [markdownStructural(), sectionCoverage(["Summary"])] };

  it("runStep aggregates findings across validators", () => {
    const res = runStep(mdStep, "no title and no summary");
    expect(res.ok).toBe(false);
    expect(res.findings.length).toBe(2); // both validators flag
  });

  it("StepRegistry/WorkflowRegistry reject duplicates", () => {
    const steps = new StepRegistry().register(mdStep);
    expect(() => steps.register(mdStep)).toThrow(StepRegistryError);
    const wf = new WorkflowRegistry().register({ id: "w", steps: [mdStep] });
    expect(wf.get("w")?.steps).toHaveLength(1);
  });

  it("runWorkflow is fail-fast and reports the first failing step", () => {
    const jsonStep: Step = { id: "json", validators: [jsonValidity()] };
    const wf = { id: "w", steps: [jsonStep, mdStep] };
    const bad = runWorkflow(wf, { json: "{broken", md: "# T\n## Summary" });
    expect(bad.ok).toBe(false);
    expect(bad.failedStep).toBe("json");
    const good = runWorkflow(wf, { json: "{}", md: "# T\n## Summary" });
    expect(good.ok).toBe(true);
    expect(good.failedStep).toBeUndefined();
  });
});
