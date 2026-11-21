// Controlled CLI fixture for the Electron smoke. Never loaded by production.
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { gateHookCommand, gateScript } from "../dist/core/init/gate-bin.js";

export async function writeCodexFixture(root) {
  const bin = join(root, "fixture-bin");
  const script =
    process.platform === "win32"
      ? join(bin, "node_modules", "@openai", "codex", "bin", "codex.js")
      : join(bin, "codex");
  await mkdir(join(script, ".."), { recursive: true });
  await writeFile(
    script,
    `#!/usr/bin/env node\nimport(${JSON.stringify(import.meta.url)}).then(module => module.runFixture()).catch(error => {console.error(error.message); process.exitCode=1;});\n`,
    { mode: 0o755 },
  );
  return bin;
}

export async function runFixture() {
  if (process.argv.includes("--version")) {
    console.log("codex-cli fixture");
    return;
  }
  if (process.argv.includes("app-server")) {
    const lines = createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      const request = JSON.parse(line);
      if (request.method === "initialize") console.log(JSON.stringify({ id: request.id, result: {} }));
      if (request.method === "hooks/list")
        console.log(
          JSON.stringify({
            id: request.id,
            result: {
              data: [
                {
                  cwd: process.cwd(),
                  errors: [],
                  warnings: [],
                  hooks: ["preToolUse", "postToolUse", "stop", "subagentStop"].map((eventName) => ({
                    eventName,
                    enabled: true,
                    trustStatus: existsSync(join(process.cwd(), ".gatewright", "fixture-trusted"))
                      ? "trusted"
                      : "untrusted",
                    sourcePath: join(process.cwd(), ".codex", "config.toml"),
                    command: gateHookCommand("codex"),
                  })),
                },
              ],
            },
          }),
        );
    });
    return;
  }
  const args = process.argv.slice(2),
    prompt = args.at(-1);
  if (
    args[args.indexOf("--sandbox") + 1] !== "workspace-write" ||
    !args.some((arg) => arg.startsWith("mcp_servers.gatewright=") && arg.includes('"required" = true'))
  )
    throw new Error("Missing governed workspace policy");
  const client = new Client({ name: "codex-cli-fixture", version: "0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [gateScript(), "serve", process.cwd()] }),
  );
  const result = await client.callTool({
    name: "check_gate",
    arguments: {
      name: "secret-guard",
      context: { cwd: process.cwd(), event: "pre-read", toolInput: { file_path: ".env" } },
    },
  });
  if (!JSON.stringify(result).includes("deny"))
    throw new Error("Gatewright MCP did not enforce the fixture check");
  await client.close();
  await mkdir(join(process.cwd(), ".gatewright"), { recursive: true });
  await writeFile(
    join(process.cwd(), ".gatewright", "codex-request.json"),
    JSON.stringify({ args, checkedGate: true }),
  );
  if (prompt.includes("CANCEL_CODEX_FIXTURE")) {
    console.log(
      JSON.stringify({
        type: "item.started",
        item: { type: "command_execution", command: "fixture waiting" },
      }),
    );
    setInterval(() => {}, 1000);
    return;
  }
  await writeFile(
    join(process.cwd(), "codex-implementation.txt"),
    "Codex fixture implementation, verified by the local test.\n",
  );
  console.log(
    JSON.stringify({
      type: "item.completed",
      item: { type: "command_execution", aggregated_output: "CODEX_FIXTURE_TEST_PASSED" },
    }),
  );
  console.log(
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: prompt.includes("FLOW_CODEX_FIXTURE")
          ? '<gate-ask>{"questions":[{"id":"approve","type":"confirm","prompt":"Aprovar etapa do Codex?"}]}</gate-ask>'
          : "Codex fixture implemented and tested.",
      },
    }),
  );
  console.log(
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 },
    }),
  );
}
