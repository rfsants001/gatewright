import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";
import { ExecutionGraph } from "../graph/execution-graph.js";
import type { Lease } from "../lease/types.js";
import { NativeInvocationStore } from "./native-invocation-store.js";
import { classify, NATIVE_HOST } from "./active-session-policy.js";
import { NodeExecutionService } from "./node-execution-service.js";
import { NativeNodeReconciler } from "./native-node-reconciler.js";
import type { NativeObservation, Invocation } from "./types.js";

const NOW = 1_000_000;
const liveLease = (): Lease => ({
  owner: "s1",
  fencingToken: 1,
  acquiredAt: NOW - 100,
  heartbeatAt: NOW - 10,
  expiresAt: NOW + 10_000,
  released: false,
});
const deadLease = (): Lease => ({ ...liveLease(), expiresAt: NOW - 1 });

const obs = (over: Partial<NativeObservation> = {}): NativeObservation => ({
  runSlug: "run-1",
  binding: "bound",
  host: NATIVE_HOST,
  lease: liveLease(),
  now: NOW,
  ...over,
});

const inv = (over: Partial<Invocation>): Invocation => ({
  runSlug: "run-1",
  selector: "a",
  kind: "start",
  at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("NativeInvocationStore", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-recon-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const journal = () => new Journal(store, join(dir, "log.json"));

  it("records and reads invocations by run and selector", () => {
    const j = journal();
    const s = new NativeInvocationStore(j);
    s.record(inv({ selector: "a", kind: "start" }));
    s.record(inv({ selector: "a", kind: "stop", outcome: "passed", at: "2026-01-01T00:01:00Z" }));
    s.record(inv({ runSlug: "other", selector: "a", kind: "start" }));
    expect(s.forRun("run-1")).toHaveLength(2);
    expect(s.forRun("run-1", "a").map((i) => i.kind)).toEqual(["start", "stop"]);
    expect(s.forRun("other")).toHaveLength(1);
  });
});

describe("classify", () => {
  it("active only when bound + native host + live lease", () => {
    expect(classify(obs())).toBe("active");
  });
  it("inactive when unbound, wrong host, or dead lease", () => {
    expect(classify(obs({ binding: "unbound" }))).toBe("inactive");
    expect(classify(obs({ host: "codex" }))).toBe("inactive");
    expect(classify(obs({ lease: deadLease() }))).toBe("inactive");
    expect(classify(obs({ lease: null }))).toBe("inactive");
  });
  it("pending when binding is unknown", () => {
    expect(classify(obs({ binding: "unknown" }))).toBe("pending");
  });
});

describe("NodeExecutionService", () => {
  it("binds start/stop invocations to node states", () => {
    const g = new ExecutionGraph().addNode("a").addNode("b").addDependency("a", "b");
    const svc = new NodeExecutionService(g);
    svc.apply(inv({ selector: "a", kind: "start" }));
    expect(g.stateOf("a")).toBe("RUNNING");
    svc.apply(inv({ selector: "a", kind: "stop", outcome: "passed" }));
    expect(g.stateOf("a")).toBe("PASSED");
  });

  it("failed stop transitively blocks dependents; unknown selector is ignored", () => {
    const g = new ExecutionGraph().addNode("a").addNode("b").addDependency("a", "b");
    const svc = new NodeExecutionService(g);
    const res = svc.applyAll([
      inv({ selector: "a", kind: "stop", outcome: "failed" }),
      inv({ selector: "ghost", kind: "start" }),
    ]);
    expect(g.stateOf("a")).toBe("FAILED");
    expect(g.stateOf("b")).toBe("BLOCKED");
    expect(res).toEqual({ applied: 1, ignored: ["ghost"] });
  });
});

describe("NativeNodeReconciler", () => {
  let dir: string;
  const store = new FileArtifactStore();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gw-recon2-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const setup = () => {
    const j = new Journal(store, join(dir, "log.json"));
    return { j, inv: new NativeInvocationStore(j), rec: (s: NativeInvocationStore) => new NativeNodeReconciler(s, j) };
  };

  it("reconciles when active with recorded invocations", () => {
    const { j, inv: invStore, rec } = setup();
    const g = new ExecutionGraph().addNode("a");
    invStore.record(inv({ selector: "a", kind: "start" }));
    invStore.record(inv({ selector: "a", kind: "stop", outcome: "passed" }));
    const r = rec(invStore).reconcile(obs(), g);
    expect(r.status).toBe("reconciled");
    expect(g.stateOf("a")).toBe("PASSED");
    expect(j.read().some((e) => e.type === "reconcile.decision")).toBe(true);
  });

  it("pending (ignored:false) when active but no invocation", () => {
    const { inv: invStore, rec } = setup();
    const r = rec(invStore).reconcile(obs(), new ExecutionGraph().addNode("a"));
    expect(r).toEqual({ status: "pending", ignored: false });
  });

  it("controller_inactive when not active", () => {
    const { inv: invStore, rec } = setup();
    const r = rec(invStore).reconcile(obs({ binding: "unbound" }), new ExecutionGraph());
    expect(r).toMatchObject({ status: "controller_inactive", code: "NODE_NATIVE_CONTROLLER_INACTIVE" });
  });
});
