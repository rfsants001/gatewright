import { execFile, spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { z } from "zod";
import { codexExecutable } from "../core/engine/codex-executable.js";
import { codexCommand } from "../core/engine/codex-command.js";
import { gateHookCommand } from "../core/init/gate-bin.js";
import { terminalConfigStatus } from "./terminal.js";
import { commandPath } from "../core/env/probes.js";

const hook = z.object({
  eventName: z.string(),
  sourcePath: z.string(),
  enabled: z.boolean(),
  trustStatus: z.string(),
  command: z.string().optional(),
});
const hooksReply = z.object({
  data: z.array(
    z.object({
      cwd: z.string(),
      hooks: z.array(hook),
      errors: z.array(z.unknown()),
      warnings: z.array(z.string()),
    }),
  ),
});
const events = ["preToolUse", "postToolUse", "stop", "subagentStop"];

export function codexEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A new task must not attach to the IPC/session of the Codex process that
  // launched Gatewright. Credentials and permission-profile controls are kept.
  for (const key of [
    "CODEX_APP_TOOLS_PIPE_PATH",
    "CODEX_APP_RUNTIME_CLI_PATH",
    "CODEX_THREAD_ID",
    "CODEX_SESSION_ID",
    "CODEX_TOOL_CALL_ID",
    "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
    "GATEWRIGHT_CODEX_RUN",
  ])
    delete env[key];
  // Enrich PATH so `codex` resolves under the GUI's minimal PATH (fnm/nvm/npm-global).
  env["PATH"] = commandPath();
  return env;
}

function terminate(child: ChildProcess, force = false) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    execFile(
      "taskkill.exe",
      ["/pid", String(child.pid), "/t", "/f"],
      { windowsHide: true, timeout: 1500 },
      () => {},
    );
    return;
  }
  try {
    process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    /* already exited */
  }
}

/** Read native hook trust, without reading auth files or trusting anything on the user's behalf. */
export async function codexReadiness(cwd: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Execução cancelada.");
  const configured = terminalConfigStatus(cwd, "codex") === "configured";
  if (!configured)
    return {
      ready: false,
      configured,
      missing: events,
      message: "Configure o Codex em Integrações → conexão do terminal antes de executar.",
    };
  const reply = await new Promise<unknown>((resolveReply, reject) => {
    const bin = codexExecutable();
    const child = spawn(bin.command, [...bin.prefix, "app-server"], {
      cwd,
      env: codexEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    let buffer = "",
      bytes = 0,
      settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      child.stdin.end();
      terminate(child, true);
      if (error) reject(error);
      else resolveReply(result);
    };
    const timer = setTimeout(
      () =>
        finish(new Error("O Codex não respondeu à verificação de hooks. Confira a CLI e tente novamente.")),
      12_000,
    );
    const abort = () => finish(new Error("Execução cancelada."));
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () =>
      finish(new Error("Não foi possível iniciar o Codex. Confira a instalação da CLI.")),
    );
    child.on("exit", () =>
      finish(new Error("O Codex encerrou a verificação. Atualize a CLI para uma versão com hooks/list.")),
    );
    child.stdin.on("error", () => finish(new Error("A conexão local com o Codex foi encerrada.")));
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2 * 1024 * 1024) {
        finish(new Error("Resposta de configuração Codex excedeu o limite."));
        return;
      }
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        let message: { id?: number; result?: unknown; error?: unknown };
        try {
          message = JSON.parse(line) as typeof message;
        } catch {
          continue;
        }
        if (message.error && (message.id === 1 || message.id === 2)) {
          finish(new Error("A CLI Codex não oferece a verificação de hooks necessária. Atualize o Codex."));
          return;
        }
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
          child.stdin.write(JSON.stringify({ id: 2, method: "hooks/list", params: { cwds: [cwd] } }) + "\n");
        }
        if (message.id === 2) {
          finish(undefined, message.result);
          return;
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "gatewright", version: "0.1.0" } },
      }) + "\n",
    );
  });
  const data = hooksReply.parse(reply).data.find((entry) => resolve(entry.cwd) === resolve(cwd));
  const expectedPath = join(realpathSync(cwd), ".codex", "config.toml");
  const command = gateHookCommand("codex");
  const missing = events.filter(
    (event) =>
      !data?.hooks.some(
        (entry) =>
          entry.eventName === event &&
          resolve(entry.sourcePath) === expectedPath &&
          entry.command === command &&
          entry.enabled &&
          ["trusted", "managed"].includes(entry.trustStatus),
      ),
  );
  const ready = !!data && !data.errors.length && !missing.length;
  return {
    ready,
    configured,
    missing,
    message: ready
      ? "MCP configurado e hooks Gatewright confiáveis no Codex."
      : "Abra o Codex nesta pasta, confie no projeto e revise os hooks Gatewright em /hooks. Depois teste novamente no app.",
  };
}

/** Worker used by every Gatewright surface; keeps native Codex auth and sandboxing. */
export async function runCodex(): Promise<number> {
  let child: ReturnType<typeof spawn> | undefined;
  let cancelled = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const cancel = () => {
    cancelled = true;
    controller.abort();
    if (child) {
      terminate(child);
      killTimer = setTimeout(() => {
        if (child) terminate(child, true);
      }, 700);
    }
  };
  process.on("SIGTERM", cancel);
  process.on("SIGINT", cancel);
  try {
    const request = z
      .object({
        cwd: z.string().min(1),
        prompt: z.string().min(1),
        mcpConfigPath: z.string().default(""),
        model: z.string().optional(),
        systemPrompt: z.string().optional(),
      })
      .parse(JSON.parse(process.env["GATEWRIGHT_CODEX_RUN"] ?? "{}"));
    const readiness = await codexReadiness(request.cwd, controller.signal);
    if (!readiness.ready) throw new Error(readiness.message);
    if (cancelled) return 130;
    const command = codexCommand({
      cwd: request.cwd,
      prompt: request.prompt,
      mcpConfigPath: request.mcpConfigPath,
      ...(request.model ? { model: request.model } : {}),
      ...(request.systemPrompt ? { systemPrompt: request.systemPrompt } : {}),
    });
    process.stdout.write(JSON.stringify({ type: "gatewright.ready", message: readiness.message }) + "\n");
    const bin = codexExecutable();
    child = spawn(bin.command, [...bin.prefix, ...command.args], {
      cwd: request.cwd,
      env: codexEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    return await new Promise<number>((done) => {
      child!.on("error", () => {
        process.stderr.write("Não foi possível executar o Codex. Confira a CLI.\n");
        done(1);
      });
      child!.on("close", (code) => done(cancelled ? 130 : (code ?? 1)));
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return cancelled ? 130 : 1;
  } finally {
    if (killTimer) clearTimeout(killTimer);
    if (child) terminate(child, true);
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
  }
}
