import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./store.js";
import { spawn } from "node:child_process";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gate-memory-"));
  roots.push(root);
  const a = join(root, "a"),
    b = join(root, "b");
  mkdirSync(a);
  mkdirSync(b);
  const user = join(root, "user");
  return { a: new MemoryStore(a, user), b: new MemoryStore(b, user), path: a };
}
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const input = {
  scope: "project",
  title: "Use strict TypeScript",
  body: "Always validate external input.",
  type: "decision",
};
const ref = (record: { id: string; scope: "project" | "user" | "run"; version: number }) => ({
  id: record.id,
  scope: record.scope,
  version: record.version,
});

describe("versioned task memory", () => {
  it("isolates projects and only lists personal records by explicit opt-in", () => {
    const { a, b } = fixture();
    const project = a.upsert(input),
      personal = a.upsert({ ...input, scope: "user" });
    expect(a.list().map((row) => row.id)).toEqual([project.id]);
    expect(b.list()).toEqual([]);
    expect(b.list({ includeUser: true }).map((row) => row.id)).toEqual([personal.id]);
    expect(() => b.resolve([ref(project)])).toThrow(/mudou/);
    expect(b.resolve([ref(personal)]).text).toContain(personal.body);
  });
  it("rejects stale edit/delete, preserves immutable snapshots and tombstones", () => {
    const { a } = fixture();
    const first = a.upsert(input);
    const snapshot = a.resolve([ref(first)]);
    const second = a.upsert({ ...input, id: first.id, version: 1, body: "New guidance" });
    expect(() => a.upsert({ ...input, id: first.id, version: 1 })).toThrow(/mudou/);
    expect(() => a.delete(ref(first))).toThrow(/mudou/);
    expect(() => a.resolve([ref(first)])).toThrow(/mudou/);
    a.delete(ref(second));
    expect(a.list()).toEqual([]);
    expect(snapshot.items[0]?.body).toEqual(first.body);
    expect(snapshot.items[0]?.version).toBe(1);
    expect(() => a.resolve([ref(second)])).toThrow(/mudou/);
    expect(() => a.upsert({ ...input, id: first.id, version: 3 })).toThrow(/mudou/);
  });
  it("restricts task scope and agent recipients and checks the combined UTF-8 budget", () => {
    const { a } = fixture();
    const record = a.upsert({ ...input, scope: "run", runId: "run-original", recipients: ["reviewer"] });
    expect(a.list()).toEqual([]);
    expect(a.list({ runId: "run-other" })).toEqual([]);
    expect(a.list({ runId: "run-original" })).toHaveLength(1);
    expect(() => a.resolve([ref(record)], { agentId: "reviewer" })).toThrow(/outra execução/);
    expect(() => a.resolve([ref(record)], { runId: "run-original", agentId: "writer" })).toThrow(/agente/);
    expect(a.resolve([ref(record)], { runId: "run-original", agentId: "reviewer" }).items).toHaveLength(1);
    const large = a.upsert({ ...input, body: "á".repeat(7000) });
    expect(() => a.resolve([ref(large)], { basePrompt: "x".repeat(6500) })).toThrow(/20 KB/);
    expect(() => a.resolve([ref(large), ref(large)])).toThrow(/uma vez/);
  });
  it("independent stores share optimistic revisions", () => {
    const { a, path } = fixture();
    const b = new MemoryStore(path, a.userHome);
    const record = a.upsert(input);
    b.upsert({ ...input, id: record.id, version: 1, body: "Saved by another client" });
    expect(() => a.upsert({ ...input, id: record.id, version: 1 })).toThrow(/mudou/);
    expect(a.list()[0]?.version).toBe(2);
  });
  it("publishes exactly one winner when separate processes edit the same version", async () => {
    const { a, path } = fixture(),
      record = a.upsert(input);
    const module = new URL("../../../dist/core/memory/store.js", import.meta.url).href;
    const code = `import {MemoryStore} from ${JSON.stringify(module)}; try {new MemoryStore(${JSON.stringify(path)},${JSON.stringify(a.userHome)}).upsert(${JSON.stringify({ ...input, id: record.id, version: 1, body: "Concurrent edit" })});process.exitCode=0;} catch {process.exitCode=2;}`;
    const outcomes = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: "ignore" });
            child.on("error", reject);
            child.on("close", resolve);
          }),
      ),
    );
    expect(outcomes.filter((code) => code === 0)).toHaveLength(1);
    expect(outcomes.filter((code) => code === 2)).toHaveLength(3);
    expect(a.list()[0]?.version).toBe(2);
  });
});
