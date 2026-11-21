import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexCommand } from "../codex-command.js";
import { createCodexAdapter } from "./codex.js";
import { ConfigStore } from "../../config/config-store.js";
import { FileArtifactStore } from "../../artifact-store/artifact-store.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
describe("Codex governed execution", () => {
  it("writes only in the workspace, requires Gatewright MCP and preserves prompt/model boundaries", () => {
    const cwd = mkdtempSync(join(tmpdir(), "codex-command-"));
    roots.push(cwd);
    new ConfigStore(new FileArtifactStore()).write(
      "project",
      {
        modules: [
          {
            id: "mcp-docs",
            kind: "mcp",
            provider: "external",
            enabled: true,
            config: { type: "http", url: "https://example.com/mcp" },
          },
        ],
      },
      cwd,
    );
    const command = codexCommand({
      cwd,
      prompt: "--unsafe is text here",
      systemPrompt: "Selected skill and memory",
      model: "chosen-model",
      mcpConfigPath: "",
    });
    expect(command.args).toEqual(
      expect.arrayContaining([
        "workspace-write",
        'approval_policy="never"',
        "sandbox_workspace_write.writable_roots=[]",
        "sandbox_workspace_write.network_access=false",
      ]),
    );
    expect(command.args.find((arg) => arg.startsWith("mcp_servers.gatewright="))).toContain(
      '"required" = true',
    );
    expect(command.args.find((arg) => arg.startsWith("mcp_servers.gatewright="))).toContain(
      '"check_gate" = { "approval_mode" = "approve" }',
    );
    expect(command.args.find((arg) => arg.startsWith("mcp_servers.gatewright="))).not.toContain(
      '"integrate_tool"',
    );
    expect(command.args.find((arg) => arg.startsWith("mcp_servers.docs="))).toContain(
      "https://example.com/mcp",
    );
    expect(command.args.slice(-2)).toEqual(["--", "Selected skill and memory\n\n--unsafe is text here"]);
    expect(command.args[command.args.indexOf("--cd") + 1]).toBe(cwd);
    expect(command.args).not.toContain("--trust");
    expect(command.args.join(" ")).not.toMatch(/danger-full-access|dangerously|full-auto/);
  });
  it("counts cached input once and exposes useful tool/error events", () => {
    const adapter = createCodexAdapter();
    expect(
      adapter.parseStreamLine(
        JSON.stringify({
          type: "turn.completed",
          usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 15 },
        }),
      ),
    ).toMatchObject({
      kind: "usage",
      usage: { tokensIn: 20, cacheRead: 80, tokensOut: 15, cumulative: true },
    });
    expect(
      adapter.parseStreamLine(
        JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "npm test" } }),
      ),
    ).toMatchObject({ kind: "tool_use", detail: "npm test" });
    expect(
      adapter.parseStreamLine(
        JSON.stringify({
          type: "item.completed",
          item: { type: "command_execution", aggregated_output: "Tests passed" },
        }),
      ),
    ).toMatchObject({ kind: "tool_result", text: "Tests passed" });
    expect(
      adapter.parseStreamLine(
        JSON.stringify({ type: "turn.failed", error: { message: "Project needs trust" } }),
      ),
    ).toMatchObject({ kind: "error", text: "Project needs trust" });
  });
});
