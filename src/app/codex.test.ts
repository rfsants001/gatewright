import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
const { applyTerminal, planRevision, planTerminal } = await import(
  new URL("../../dist/app/terminal.js", import.meta.url).href
);
const { codexReadiness } = await import(new URL("../../dist/app/codex.js", import.meta.url).href);
import { codexEnvironment } from "./codex.js";
const { gateHookCommand } = await import(new URL("../../dist/core/init/gate-bin.js", import.meta.url).href);
const { createCodexAdapter } = await import(
  new URL("../../dist/core/engine/adapters/codex.js", import.meta.url).href
);
import { startRun } from "../core/engine/runner.js";
import { openRunJournal } from "../core/engine/run-journal.js";

describe("Codex worker and native readiness protocol", () => {
  let root: string, cwd: string;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "codex-worker-")));
    cwd = join(root, "project with spaces");
    mkdirSync(cwd);
    const bin = join(root, "bin");
    mkdirSync(bin);
    const source = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), readline = require('node:readline'), cp = require('node:child_process');
if (process.argv[2] === 'app-server') {
 const input=readline.createInterface({input:process.stdin});
 input.on('line',line=>{const msg=JSON.parse(line);if(msg.method==='initialize')console.log(JSON.stringify({id:msg.id,result:{}}));
 if(msg.method==='hooks/list')console.log(JSON.stringify({id:msg.id,result:{data:[{cwd:process.cwd(),errors:[],warnings:[],hooks:['preToolUse','postToolUse','stop','subagentStop'].map(eventName=>({eventName,enabled:true,trustStatus:process.env.GATEWRIGHT_FIXTURE_TRUST||'trusted',sourcePath:path.join(process.cwd(),'.codex','config.toml'),command:${JSON.stringify(gateHookCommand("codex"))}}))}]}}));});
} else {
 const args=process.argv.slice(2);fs.writeFileSync(path.join(process.cwd(),'argv.json'),JSON.stringify(args));
 if(args[args.indexOf('--sandbox')+1]!=='workspace-write'||!args.some(a=>a.startsWith('mcp_servers.gatewright=')&&a.includes('"required" = true')))process.exit(3);
 const hold=args.at(-1)==='hold';
 if(hold){const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(path.join(process.cwd(),'child.pid'),String(child.pid));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'holding'}}));setInterval(()=>{},1000);}
 else {fs.writeFileSync(path.join(process.cwd(),'implemented.txt'),'written');console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Implemented and tested'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:40,output_tokens:20}}));}
}`;
    const script =
      process.platform === "win32"
        ? join(bin, "node_modules", "@openai", "codex", "bin", "codex.js")
        : join(bin, "codex");
    mkdirSync(join(script, ".."), { recursive: true });
    writeFileSync(script, source);
    chmodSync(script, 0o755);
    vi.stubEnv("PATH", `${bin}${delimiter}${process.env["PATH"] ?? ""}`);
    vi.stubEnv("GATEWRIGHT_HOME", join(root, "gate-home"));
    applyTerminal(cwd, "codex", planRevision(planTerminal(cwd, "codex")));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
  it("starts an independent native session while retaining credential and permission controls", () => {
    vi.stubEnv("CODEX_THREAD_ID", "parent-thread");
    vi.stubEnv("CODEX_APP_TOOLS_PIPE_PATH", "parent-ipc");
    vi.stubEnv("CODEX_PERMISSION_PROFILE", "preserved-policy");
    vi.stubEnv("CODEX_HOME", "preserved-login-home");
    const env = codexEnvironment();
    expect(env["CODEX_THREAD_ID"]).toBeUndefined();
    expect(env["CODEX_APP_TOOLS_PIPE_PATH"]).toBeUndefined();
    expect(env["CODEX_PERMISSION_PROFILE"]).toBe("preserved-policy");
    expect(env["CODEX_HOME"]).toBe("preserved-login-home");
  });
  it("checks trust before starting, then writes and journals context plus non-duplicated usage", async () => {
    expect((await codexReadiness(cwd)).ready).toBe(true);
    const run = startRun(createCodexAdapter(), {
      cwd,
      prompt: "implement",
      mcpConfigPath: "",
      systemPrompt: "Selected skills and memories",
      runContext: { agentId: "reviewer", attributionSource: "run-start" },
    });
    expect(await run.done).toMatchObject({ state: "PASSED" });
    expect(readFileSync(join(cwd, "implemented.txt"), "utf8")).toBe("written");
    const args = JSON.parse(readFileSync(join(cwd, "argv.json"), "utf8"));
    expect(args.at(-1)).toContain("Selected skills and memories");
    const journal = openRunJournal(cwd, run.id).journal;
    expect(journal.verify().ok).toBe(true);
    expect(journal.read().find((event) => event.type === "RUN_CONTEXT")?.payload).toMatchObject({
      agentId: "reviewer",
    });
    expect(
      journal
        .read()
        .find(
          (event) => event.type === "ENGINE_EVENT" && (event.payload as { kind: string }).kind === "usage",
        )?.payload,
    ).toMatchObject({ usage: { tokensIn: 60, cacheRead: 40, tokensOut: 20 } });
  });
  it.each(["untrusted", "modified"])("does not execute with %s hooks", async (trust) => {
    vi.stubEnv("GATEWRIGHT_FIXTURE_TRUST", trust);
    expect((await codexReadiness(cwd)).ready).toBe(false);
    const run = startRun(createCodexAdapter(), { cwd, prompt: "implement", mcpConfigPath: "" });
    expect(await run.done).toMatchObject({ state: "FAILED" });
    expect(existsSync(join(cwd, "argv.json"))).toBe(false);
    expect(existsSync(join(cwd, "implemented.txt"))).toBe(false);
  });
  it("cancels the native process group, including its child", async () => {
    const run = startRun(createCodexAdapter(), { cwd, prompt: "hold", mcpConfigPath: "" });
    await vi.waitFor(() => expect(existsSync(join(cwd, "child.pid"))).toBe(true), { timeout: 4000 });
    const pid = Number(readFileSync(join(cwd, "child.pid"), "utf8"));
    run.cancel();
    expect(await run.done).toMatchObject({ state: "CANCELLED" });
    await vi.waitFor(
      () => {
        let alive = true;
        try {
          process.kill(pid, 0);
        } catch {
          alive = false;
        }
        expect(alive).toBe(false);
      },
      { timeout: 3000 },
    );
  });
});
