import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { z } from "zod";
import { ProjectRegistry } from "../core/project/registry.js";
import { defaultEngineRegistry } from "../core/engine/default-registry.js";
import { ensureGateMcpConfig } from "../core/engine/gate-mcp-config.js";
import { type EngineAdapter } from "../core/engine/types.js";
import { openRunJournal } from "../core/engine/run-journal.js";
import { startRun, type RunHandle } from "../core/engine/runner.js";
import { aggregateUsage } from "../core/run/usage.js";
import { FlowEngine } from "../core/flow/flow.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";
import { stripQuestions } from "../core/flow/questions.js";
import { buildSkillsSystemPrompt, loadGateSkills } from "../core/skills/gate-catalog.js";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { applyTerminal, planRevision, planTerminal, terminalHosts } from "../app/terminal.js";
import { complete, providerAdapter, providers, providerSchema, saveProvider } from "../app/providers.js";
import { applyChange, changeRevision, customizationPrompt, parseChange, type Change } from "../app/customize.js";

const requestSchema = z.object({ id: z.number(), method: z.string(), params: z.unknown().optional() });
const projectPath = z.object({ cwd: z.string().min(1) });
const hostRequest = projectPath.extend({ host: z.enum(terminalHosts) });

export async function serveDesktop(): Promise<void> {
  const registry = defaultEngineRegistry();
  const projects = new ProjectRegistry();
  const config = new ConfigStore(new FileArtifactStore());
  const active = new Map<string, RunHandle>();
  const proposals = new Map<string, { cwd: string; change: Change }>();
  const reviews = new Map<string, { cwd: string; runId: string }>();
  let selected: string | undefined;
  let flow: {
    cwd: string; adapter: EngineAdapter; model?: string; engine: FlowEngine;
    pending?: { token: string; text: string; runId: string; revision: string };
  } | undefined;
  const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");

  function assertProject(value: unknown): string {
    const { cwd } = projectPath.parse(value);
    if (cwd !== selected) throw new Error("Abra o projeto antes de usar esta ação.");
    return cwd;
  }

  function review(cwd: string, runId: string) {
    const git = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
    const status = git(["status", "--short", "--untracked-files=all"]);
    const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter((name) => name && !name.startsWith(".gatewright/"));
    let bytes = 0;
    const newFiles = untracked.map((name) => {
      const file = join(cwd, name);
      const info = lstatSync(file);
      bytes += info.size;
      if (!info.isFile() || info.size > 512 * 1024 || bytes > 4 * 1024 * 1024) {
        throw new Error("Adicione arquivos grandes ou links novos ao índice Git para revisar.");
      }
      const content = readFileSync(file);
      return { text: `Novo arquivo: ${name}\n${content.toString("utf8")}`, hash: createHash("sha256").update(content).digest("hex") };
    });
    const diff = [git(["diff", "--binary", "--no-ext-diff", "--no-textconv", "HEAD", "--"]), ...newFiles.map((file) => file.text)].filter(Boolean).join("\n\n");
    const head = git(["rev-parse", "HEAD"]).trim();
    const journal = openRunJournal(cwd, runId).journal;
    const revision = createHash("sha256").update(JSON.stringify([cwd, runId, head, status, diff, newFiles.map((file) => file.hash), journal.head()])).digest("hex");
    return { revision, head, status, diff };
  }

  function start(cwd: string, adapter: EngineAdapter, prompt: string, model?: string, includeSkills = false) {
    const systemPrompt = includeSkills ? buildSkillsSystemPrompt([...loadGateSkills().list(), ...loadGateSkills(join(cwd, ".gatewright", "skills")).list()]) : undefined;
    const handle = startRun(adapter, {
      prompt, cwd, mcpConfigPath: adapter.id === "claude-code" ? ensureGateMcpConfig(cwd) : "",
      ...(model ? { model } : {}), ...(systemPrompt ? { systemPrompt } : {}),
      ...(adapter.id === "claude-code" ? { contextDirs: config.resolve(cwd).linkedProjects ?? [] } : {}),
    }, {
      onEvent: ({ raw: _raw, ...event }) => send({ event: "run.log", cwd, data: event }),
      onState: (state) => send({ event: "run.state", cwd, data: state }),
    });
    active.set(handle.id, handle);
    void handle.done.then(() => active.delete(handle.id));
    return handle;
  }

  function advance(current: NonNullable<typeof flow>, last?: { runId: string; text: string }): { runId?: string } {
    const directive = current.engine.peek();
    if (directive.type === "done") {
      flow = undefined;
      send({ event: "flow.done", cwd: current.cwd, data: null });
      return {};
    }
    if (directive.type === "ask") {
      if (!last) throw new Error("Não há execução para revisar.");
      const snapshot = review(current.cwd, last.runId);
      const token = createHash("sha256").update(JSON.stringify([snapshot.revision, directive.step.id, directive.questions])).digest("hex");
      current.pending = { token, text: last.text, runId: last.runId, revision: snapshot.revision };
      send({ event: "flow.ask", cwd: current.cwd, data: { token, title: directive.step.title, questions: directive.questions, output: stripQuestions(last.text), diff: snapshot.diff } });
      return {};
    }
    const run = start(current.cwd, current.adapter, directive.prompt, current.model, true);
    void run.done.then((result) => {
      if (flow !== current) return;
      if (result.state !== "PASSED") {
        flow = undefined;
        send({ event: "flow.error", cwd: current.cwd, data: "A etapa falhou ou foi cancelada. O fluxo foi interrompido." });
        return;
      }
      try {
        const journal = openRunJournal(current.cwd, run.id).journal;
        const output = journal.read().flatMap((entry) => {
          const payload = entry.payload as { kind?: string; text?: string };
          return entry.type === "ENGINE_EVENT" && (payload.kind === "assistant" || payload.kind === "result") && payload.text ? [payload.text] : [];
        }).join("\n");
        current.engine.submitRun(output);
        const next = advance(current, { runId: run.id, text: output });
        if (next.runId) send({ event: "flow.run", cwd: current.cwd, data: next.runId });
      } catch (error) {
        flow = undefined;
        send({ event: "flow.error", cwd: current.cwd, data: error instanceof Error ? error.message : String(error) });
      }
    });
    return { runId: run.id };
  }

  async function call(method: string, params: unknown): Promise<unknown> {
    if (method === "projects") return projects.list();
    if (method === "cancel") {
      active.get(z.object({ runId: z.string() }).parse(params).runId)?.cancel();
      return null;
    }
    if (method === "open") {
      if (active.size || flow) throw new Error("Encerre o trabalho atual antes de abrir outro projeto.");
      const cwd = realpathSync(projectPath.parse(params).cwd);
      if (!statSync(cwd).isDirectory()) throw new Error("Selecione uma pasta de projeto.");
      projects.register({ path: cwd, name: basename(cwd), configuredAt: new Date().toISOString() });
      selected = cwd;
      return { cwd };
    }
    const cwd = assertProject(params);
    switch (method) {
      case "snapshot": return {
        usage: aggregateUsage(cwd),
        linkedProjects: config.resolve(cwd).linkedProjects ?? [],
        skills: [...new Set([loadGateSkills(), loadGateSkills(join(cwd, ".gatewright", "skills"))].flatMap((catalog) => catalog.list().map((skill) => skill.frontmatter.name)))].sort(),
        providers: providers(cwd),
        hosts: (await registry.detectAll()).map(({ adapter, availability }) => ({
          id: adapter.id, name: adapter.name, installed: availability.installed, version: availability.version,
          hooks: adapter.id !== "opencode",
        })),
      };
      case "terminal.preview": {
        const { host } = hostRequest.parse(params);
        const plans = planTerminal(cwd, host);
        return { revision: planRevision(plans), changes: plans.map(({ path, action, summary }) => ({ path, action, summary })) };
      }
      case "terminal.apply": {
        const { host, revision } = hostRequest.extend({ revision: z.string() }).parse(params);
        applyTerminal(cwd, host, revision);
        return null;
      }
      case "provider.save": {
        const { provider } = projectPath.extend({ provider: providerSchema }).parse(params);
        saveProvider(cwd, provider);
        return null;
      }
      case "customize.propose": {
        const { providerId, model, prompt } = projectPath.extend({
          providerId: z.string(), model: z.string().optional(), prompt: z.string().trim().min(1).max(4000),
        }).parse(params);
        const provider = providers(cwd).find((entry) => entry.id === providerId);
        if (!provider) throw new Error("Selecione um provedor configurado.");
        const result = await complete(providerSchema.parse({ ...provider, model: model || provider.model }), prompt, AbortSignal.timeout(60_000), customizationPrompt);
        let change: Change;
        try { change = parseChange(result.text); }
        catch { return { message: result.text.slice(0, 1000) }; }
        const revision = changeRevision(cwd, change);
        if (proposals.size >= 20) proposals.clear();
        proposals.set(revision, { cwd, change });
        return { revision, change };
      }
      case "customize.apply": {
        const { revision } = projectPath.extend({ revision: z.string() }).parse(params);
        const proposal = proposals.get(revision);
        if (!proposal || proposal.cwd !== cwd) throw new Error("A proposta expirou. Gere uma nova proposta.");
        applyChange(cwd, proposal.change, revision);
        proposals.delete(revision);
        return null;
      }
      case "review": {
        const { runId } = projectPath.extend({ runId: z.uuid().or(z.string().regex(/^run-[a-f0-9-]{36}$/)) }).parse(params);
        if (active.has(runId)) throw new Error("Aguarde o fim da execução antes de revisar.");
        const journal = openRunJournal(cwd, runId).journal;
        if (!journal.head() || !journal.read().length) throw new Error("Execução não encontrada.");
        const snapshot = review(cwd, runId);
        if (reviews.size >= 20) reviews.clear();
        reviews.set(snapshot.revision, { cwd, runId });
        return snapshot;
      }
      case "review.decide": {
        const { revision, approved } = projectPath.extend({ revision: z.string(), approved: z.boolean() }).parse(params);
        const pending = reviews.get(revision);
        if (!pending || pending.cwd !== cwd || review(cwd, pending.runId).revision !== revision) {
          throw new Error("A revisão mudou. Abra o diff novamente antes de decidir.");
        }
        openRunJournal(cwd, pending.runId).journal.append({
          type: "DESKTOP_REVIEW", at: new Date().toISOString(), payload: { revision, approved },
        });
        reviews.delete(revision);
        return null;
      }
      case "flow.answer": {
        const { token, answers } = projectPath.extend({ token: z.string(), answers: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])) }).parse(params);
        const current = flow;
        const pending = current?.pending;
        if (!current || current.cwd !== cwd || !pending || pending.token !== token) throw new Error("Esta revisão já foi encerrada.");
        if (review(cwd, pending.runId).revision !== pending.revision) {
          const next = advance(current, { runId: pending.runId, text: pending.text });
          return next;
        }
        const directive = current.engine.peek();
        if (directive.type !== "ask" || directive.questions.some((question) => !Object.hasOwn(answers, question.id)
          || (question.type === "confirm" && typeof answers[question.id] !== "boolean"))) throw new Error("Responda às perguntas para continuar.");
        openRunJournal(cwd, pending.runId).journal.append({
          type: "DESKTOP_FLOW_DECISION", at: new Date().toISOString(), payload: { token, answers },
        });
        delete current.pending;
        const next = current.engine.submitAnswers(answers);
        if (next.type === "done" && next.aborted) {
          flow = undefined;
          send({ event: "flow.done", cwd, data: "Revisão recusada. O fluxo foi encerrado." });
          return {};
        }
        return advance(current, { runId: pending.runId, text: pending.text });
      }
      case "flow.stop":
        if (flow?.cwd === cwd) {
          flow = undefined;
          for (const handle of active.values()) handle.cancel();
          send({ event: "flow.done", cwd, data: "Fluxo encerrado." });
        }
        return null;
      case "run":
      case "flow.start": {
        const { engine, model, prompt } = projectPath.extend({ engine: z.string(), model: z.string().optional(), prompt: z.string().trim().min(1).max(48_000) }).parse(params);
        if (active.size || flow) throw new Error("Aguarde ou encerre o trabalho atual antes de iniciar outro.");
        const provider = providers(cwd).find((entry) => `provider:${entry.id}` === engine);
        const adapter = provider ? providerAdapter(provider) : registry.get(engine);
        if (method === "run") return { runId: start(cwd, adapter, prompt, model).id };
        if (provider) throw new Error("Escolha um agente de terminal para executar o fluxo com ferramentas.");
        const steps = buildSddFlow().filter((step) => step.id !== "confirm-ship" && step.id !== "ship");
        const current = { cwd, adapter, ...(model ? { model } : {}), engine: new FlowEngine(steps, prompt) };
        flow = current;
        try { return advance(current); }
        catch (error) { flow = undefined; throw error; }
      }
      default: throw new Error("Ação desconhecida.");
    }
  }

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    let decoded: unknown;
    try { decoded = JSON.parse(line); } catch { continue; }
    const request = requestSchema.safeParse(decoded);
    if (!request.success) continue;
    const { id, method, params } = request.data;
    void call(method, params).then(
      (result) => send({ id, result }),
      (error: unknown) => send({ id, error: error instanceof Error ? error.message : String(error) }),
    );
  }
  for (const handle of active.values()) handle.cancel();
}
