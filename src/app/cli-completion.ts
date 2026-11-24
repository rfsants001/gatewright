// One-shot text completion from an inherited-cli host (Claude Code, Codex), so
// the "Config por IA" card can use a paid subscription CLI as the generator —
// not only an HTTP provider (Ollama / OpenAI-compatible proxy).
//
// These CLIs are agent runners, but here we invoke them headless, text-only and
// WITHOUT edit permission (Claude: no MCP/tools passed; Codex: --sandbox
// read-only), so a proposal request can never touch the project. The resulting
// Change is still gated by the usual human-approved propose/apply flow.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandPath } from "../core/env/probes.js";
import type { EngineEvent } from "../core/engine/types.js";

/** Host ids that can act as a one-shot completion source. */
export const CLI_COMPLETION_IDS = ["claude-code", "codex"] as const;
export type CliCompletionId = (typeof CLI_COMPLETION_IDS)[number];

export function isCliCompletionId(id: string): id is CliCompletionId {
  return (CLI_COMPLETION_IDS as readonly string[]).includes(id);
}

export interface CliResult {
  text: string;
  usage?: EngineEvent["usage"];
}

/** Injectable process runner: runs bin+args (GUI-enriched PATH), resolves stdout. For tests. */
export type CliRunner = (bin: string, args: string[], signal: AbortSignal) => Promise<string>;

const defaultRunner: CliRunner = (bin, args, signal) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, PATH: commandPath() },
      signal,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} saiu com código ${code ?? "?"}.`));
    });
  });

function claudeUsage(raw: unknown): EngineEvent["usage"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, number>;
  return {
    tokensIn: u["input_tokens"] ?? 0,
    tokensOut: u["output_tokens"] ?? 0,
    cacheRead: u["cache_read_input_tokens"] ?? 0,
    model: "claude-code",
    cumulative: true,
  };
}

async function claudeComplete(prompt: string, systemPrompt: string | undefined, signal: AbortSignal, run: CliRunner): Promise<CliResult> {
  const args = ["-p", prompt, "--output-format", "json", ...(systemPrompt ? ["--append-system-prompt", systemPrompt] : [])];
  const stdout = await run("claude", args, signal);
  let parsed: { result?: unknown; is_error?: boolean; subtype?: string; usage?: unknown };
  try { parsed = JSON.parse(stdout) as typeof parsed; }
  catch { throw new Error("Claude Code não retornou um JSON válido."); }
  if (parsed.is_error || parsed.subtype !== "success" || typeof parsed.result !== "string") {
    throw new Error(typeof parsed.result === "string" ? parsed.result : "Claude Code não retornou uma resposta.");
  }
  const usage = claudeUsage(parsed.usage);
  return usage ? { text: parsed.result, usage } : { text: parsed.result };
}

async function codexComplete(prompt: string, systemPrompt: string | undefined, signal: AbortSignal, run: CliRunner): Promise<CliResult> {
  // Codex has no system-prompt flag; fold it into the instruction. -o writes the
  // final message to a file, so we avoid parsing the JSONL event stream.
  const full = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const outFile = join(tmpdir(), `gw-codex-${randomUUID()}.txt`);
  try {
    await run("codex", ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "-o", outFile, full], signal);
    const text = readFileSync(outFile, "utf8").trim();
    if (!text) throw new Error("Codex não retornou uma resposta.");
    return { text };
  } finally {
    rmSync(outFile, { force: true });
  }
}

/** Run a one-shot, no-edit completion through a host CLI. `run` is injectable for tests. */
export async function completeViaCli(
  id: CliCompletionId,
  prompt: string,
  signal: AbortSignal,
  systemPrompt?: string,
  run: CliRunner = defaultRunner,
): Promise<CliResult> {
  if (id === "claude-code") return claudeComplete(prompt, systemPrompt, signal, run);
  if (id === "codex") return codexComplete(prompt, systemPrompt, signal, run);
  throw new Error(`CLI de IA não suportada: ${id as string}`);
}
