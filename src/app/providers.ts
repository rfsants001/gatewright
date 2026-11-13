import { z } from "zod";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { gateScript } from "../core/init/gate-bin.js";
import type { EngineAdapter, EngineEvent } from "../core/engine/types.js";

export const providerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  endpoint: z.url().refine((value) => {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === "https:" || (loopback && url.protocol === "http:"));
  }, "Use HTTPS or a local loopback HTTP endpoint without credentials."),
  model: z.string().trim().min(1).max(150),
  keyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
}).strict();
export type Provider = z.infer<typeof providerSchema>;

const ollama: Provider = { id: "ollama", endpoint: "http://127.0.0.1:11434/v1", model: "" };
const store = new ConfigStore(new FileArtifactStore());

export function providers(cwd: string): Provider[] {
  const entries = store.resolve(cwd).providers ?? [];
  const valid = entries.flatMap((entry) => {
    const parsed = providerSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return [ollama, ...valid.filter((entry) => entry.id !== "ollama")];
}

export function saveProvider(cwd: string, provider: Provider): void {
  if (provider.id === "ollama") throw new Error("Ollama é um provedor local integrado. Use outro ID para um endpoint personalizado.");
  const scoped = store.read("project", cwd).providers ?? [];
  store.write("project", { providers: [...scoped.filter((entry) => entry.id !== provider.id), provider] }, cwd);
}

export async function complete(provider: Provider, prompt: string, signal: AbortSignal, systemPrompt?: string): Promise<{ text: string; usage?: EngineEvent["usage"] }> {
  const key = provider.keyEnv ? process.env[provider.keyEnv] : undefined;
  if (provider.keyEnv && !key) throw new Error(`Defina a variável ${provider.keyEnv} no ambiente do Gatewright.`);
  const response = await fetch(`${provider.endpoint.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    redirect: "error",
    signal,
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({
      model: provider.model,
      messages: [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`O provedor respondeu HTTP ${response.status}. Confira o endpoint, o modelo e a credencial.`);
  const body = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("O provedor não retornou uma resposta de texto.");
  if (!body.usage) return { text };
  const cacheRead = body.usage.prompt_tokens_details?.cached_tokens ?? 0;
  return { text, usage: {
    tokensIn: Math.max(0, (body.usage.prompt_tokens ?? 0) - cacheRead),
    tokensOut: body.usage.completion_tokens ?? 0, cacheRead, model: body.model ?? provider.model, cumulative: true,
  } };
}

export function providerAdapter(provider: Provider): EngineAdapter {
  return {
    id: provider.id,
    name: provider.id,
    authModel: "api-key",
    async detect() { return { installed: true }; },
    buildHeadlessCommand(opts) {
      const request = { provider: providerSchema.parse({ ...provider, model: opts.model || provider.model }), prompt: opts.prompt, systemPrompt: opts.systemPrompt };
      return { bin: process.execPath, args: [gateScript(), "complete"], env: { GATEWRIGHT_COMPLETION: JSON.stringify(request) } };
    },
    parseStreamLine(line) {
      try { return JSON.parse(line) as EngineEvent; } catch { return null; }
    },
  };
}

export async function runCompletion(): Promise<number> {
  try {
    const request = z.object({ provider: providerSchema, prompt: z.string(), systemPrompt: z.string().optional() }).parse(JSON.parse(process.env.GATEWRIGHT_COMPLETION ?? "{}"));
    const result = await complete(request.provider, request.prompt, AbortSignal.timeout(180_000), request.systemPrompt);
    process.stdout.write(JSON.stringify({ kind: "assistant", text: result.text }) + "\n");
    if (result.usage) process.stdout.write(JSON.stringify({ kind: "usage", usage: result.usage }) + "\n");
    return 0;
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    return 1;
  }
}
