import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { generateCodeMap, getCodeMap, mapFile, normalizeMapPath, parseCodeMap, readMapFile } from "./map.js";
import { ConfigStore } from "../config/config-store.js";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { finishOperation, operationSnapshot, startOperation } from "../integrations/operations.js";

const roots: string[] = [];
const graph = readFileSync(new URL("./fixtures/graphify-0.9.114.json", import.meta.url), "utf8");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codemap-test-"));
  roots.push(root);
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "graphify-out"));
  writeFileSync(join(root, "src", "hello.ts"), "export const hello = 1;\n");
  return root;
}
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { force: true, recursive: true })));

describe("Graphify code map", () => {
  it("generates through the registered interpreter and resolves superseded failed map operations", async () => {
    const root = fixture();
    await expect(generateCodeMap(root)).rejects.toThrow(/Instale o Graphify/);
    new ConfigStore(new FileArtifactStore()).write(
      "project",
      {
        modules: [
          {
            id: "mcp-graphify",
            kind: "mcp",
            provider: "external",
            enabled: true,
            config: {
              type: "stdio",
              command: process.execPath,
              args: ["-m", "graphify.serve", join(root, "graphify-out", "graph.json")],
            },
          },
        ],
      },
      root,
    );
    startOperation(root, { id: "older-map", revision: "old", recipeKind: "codemap", steps: [] });
    finishOperation(root, "older-map", "failed");
    const events: unknown[] = [];
    const result = await generateCodeMap(
      root,
      (event) => events.push(event),
      async (step) => {
        expect(step.args.slice(-2)).toEqual(["--out", "."]);
        expect(step.args).toContain("--code-only");
        writeFileSync(join(root, "graphify-out", "graph.json"), graph);
        return { ok: true, output: "generated" };
      },
    );
    expect(result.map.nodes).toHaveLength(3);
    expect(events).toHaveLength(2);
    expect(operationSnapshot(root, "older-map")?.status).toBe("reverted");
  });
  it("normalizes a real 0.9.114 code-only artifact and supports the versioned links format", () => {
    const root = fixture(),
      map = parseCodeMap(root, graph);
    expect(map.nodes).toHaveLength(3);
    expect(map.links.some((link) => link.relation === "calls")).toBe(true);
    expect(map.nodes[1]).toMatchObject({ path: "src/hello.ts", kind: "function" });
    const data = JSON.parse(graph);
    data.links = data.edges;
    delete data.edges;
    data.graph = { schema_version: 1, graphify_version: "0.9.114" };
    expect(parseCodeMap(root, JSON.stringify(data)).graphifyVersion).toBe("0.9.114");
    data.graph.schema_version = 2;
    expect(() => parseCodeMap(root, JSON.stringify(data))).toThrow(/incompatível/);
  });
  it("retains the last valid map on malformed, oversized or absent input", () => {
    const root = fixture(),
      path = join(root, "graphify-out", "graph.json");
    expect(getCodeMap(root)).toBeNull();
    writeFileSync(path, graph);
    const original = getCodeMap(root)!;
    writeFileSync(path, "invalid json");
    expect(getCodeMap(root)).toMatchObject({
      revision: original.revision,
      stale: true,
      warning: expect.stringContaining("última versão válida"),
    });
    expect(() => parseCodeMap(root, " ".repeat(20 * 1024 * 1024 + 1))).toThrow(/20 MB/);
    const data = JSON.parse(graph);
    data.nodes = Array.from({ length: 4100 }, (_, id) => ({ id, label: `node ${id}` }));
    expect(parseCodeMap(root, JSON.stringify(data))).toMatchObject({ truncated: true, totalNodes: 4100 });
  });
  it("normalizes Windows paths and rejects traversal, symlinks and binary reads", () => {
    const root = fixture();
    expect(normalizeMapPath("C:\\repo", "c:\\repo\\src\\hello.ts")).toBe("src/hello.ts");
    expect(normalizeMapPath(root, "../outside.ts")).toBeUndefined();
    expect(normalizeMapPath(root, "C:\\outside.ts")).toBeUndefined();
    expect(() => mapFile(root, "../elsewhere")).toThrow(/dentro/);
    const outside = fixture();
    symlinkSync(
      join(outside, "src"),
      join(root, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() => mapFile(root, "linked/hello.ts")).toThrow(/fora/);
    writeFileSync(join(root, "src", "binary"), Buffer.from([0, 1, 2]));
    expect(() => readMapFile(root, "src/binary")).toThrow(/binário/);
  });
  it("relates changed and renamed files to symbols, with readable diff", () => {
    const root = fixture();
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init");
    git("-c", "user.name=Test", "-c", "user.email=test@example.test", "add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "initial");
    writeFileSync(join(root, "graphify-out", "graph.json"), graph);
    writeFileSync(join(root, "src", "hello.ts"), "export const hello = 2;\n");
    expect(getCodeMap(root)?.nodes[0]?.changed).toBe("M");
    expect(readMapFile(root, "src/hello.ts").diff).toContain("+export const hello = 2");
    git("mv", "src/hello.ts", "src/greeting.ts");
    expect(getCodeMap(root)?.nodes[0]?.changed).toContain("R → src/greeting.ts");
  });
});
