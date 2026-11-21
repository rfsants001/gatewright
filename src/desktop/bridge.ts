import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
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
import { FlowEngine, replayFlow, type FlowInput } from "../core/flow/flow.js";
import { buildSddFlow } from "../core/flow/sdd-flow.js";
import {
  openFlowJournal, appendStart, appendRun, appendAnswers, appendTerminal,
  readEntries,
  FLOW_START_TYPE, FLOW_TERMINAL_TYPE, FLOW_RUN_TYPE, FLOW_ANSWERS_TYPE,
  type FlowStartEntry,
} from "../core/flow/flow-journal.js";
import { Journal } from "../core/journal/journal.js";
import { stripQuestions } from "../core/flow/questions.js";
import { buildSkillsSystemPrompt } from "../core/skills/gate-catalog.js";
import { agentSchema, composeAgent, projectAgents, projectSkills, saveAgent, updateAgent, deleteAgent } from "../core/skills/agents.js";
import { listSkills, skillDetail } from "../core/skills/skills-query.js";
import { integrationName, managedMcpReady, managedMcpServers } from "../core/integrations/managed-mcp.js";
import { ConfigStore } from "../core/config/config-store.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { applyTerminal, planRevision, planTerminal, terminalConfigStatus, terminalHosts } from "../app/terminal.js";
import { testGatewrightMcp, testManagedMcp } from "../app/integration-diagnostics.js";
import { complete, providerAdapter, providers, providerSchema, saveProvider } from "../app/providers.js";
import { applyChange, changeRevision, checkProposalSources, customizationPrompt, describeChange, parseChange, skillChangeSchema, type Change } from "../app/customize.js";
import { applyIntegration } from "../core/integrations/configure.js";
import { finishOperation, listOperations, operationSnapshot, recordStep, startOperation } from "../core/integrations/operations.js";
import { integrationRevision, readHealth, recordHealthAttempt } from "../core/integrations/health.js";

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
  const inFlight = new Set<string>(); // revision lock — prevents concurrent apply of same proposal
  let selected: string | undefined;
  let applying = false;
  let flow: {
    cwd: string; adapter: EngineAdapter; model?: string; agentPrompt?: string; engine: FlowEngine;
    journal: Journal;
    pending?: { token: string; text: string; runId: string; revision: string };
  } | undefined;
  type AskPayload = { token: string; title: string; questions: unknown[]; output: string; diff: string };
  type ResumableFlow =
    | { title: string; atKind: "ask"; pendingAsk: true; ask: AskPayload }
    | { title: string; atKind: "ask"; pendingAsk: false }
    | { title: string; atKind: "run" };
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

  function start(cwd: string, adapter: EngineAdapter, prompt: string, model?: string, systemPrompt?: string) {
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
      appendTerminal(current.journal, "done");
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
    const run = start(current.cwd, current.adapter, directive.prompt, current.model,
      current.agentPrompt ?? buildSkillsSystemPrompt([...projectSkills(current.cwd).values()]));
    void run.done.then((result) => {
      if (flow !== current) return;
      if (result.state !== "PASSED") {
        appendTerminal(current.journal, "stopped");
        flow = undefined;
        send({ event: "flow.error", cwd: current.cwd, data: "A etapa falhou ou foi cancelada. O fluxo foi interrompido." });
        return;
      }
      try {
        const runJournal = openRunJournal(current.cwd, run.id).journal;
        const output = runJournal.read().flatMap((entry) => {
          const payload = entry.payload as { kind?: string; text?: string };
          return entry.type === "ENGINE_EVENT" && (payload.kind === "assistant" || payload.kind === "result") && payload.text ? [payload.text] : [];
        }).join("\n");
        const runDirective = current.engine.peek();
        const stepId = runDirective.type !== "done" ? runDirective.step.id : run.id;
        current.engine.submitRun(output);
        appendRun(current.journal, { stepId, output, runId: run.id });
        const next = advance(current, { runId: run.id, text: output });
        if (next.runId) send({ event: "flow.run", cwd: current.cwd, data: next.runId });
      } catch (error) {
        appendTerminal(current.journal, "stopped");
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
    if (applying) throw new Error("Aguarde a aplicação da integração.");
    if (method === "open") {
      if (active.size || flow) throw new Error("Encerre o trabalho atual antes de abrir outro projeto.");
      const cwd = realpathSync(projectPath.parse(params).cwd);
      if (!statSync(cwd).isDirectory()) throw new Error("Selecione uma pasta de projeto.");
      projects.register({ path: cwd, name: basename(cwd), configuredAt: new Date().toISOString() });
      selected = cwd;

      // ── FDR-004: attempt durable resume ───────────────────────────────────
      let resumableFlow: ResumableFlow | undefined;
      try {
        const flowJournal = openFlowJournal(cwd);
        const entries = readEntries(flowJournal);

        // Find the index of the LAST FLOW_START entry.
        let startIdx = -1;
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i]!;
          if (e.type === FLOW_START_TYPE) { startIdx = i; break; }
        }

        if (startIdx !== -1) {
          const segment = entries.slice(startIdx);
          // If the segment contains a FLOW_TERMINAL → no resume.
          const hasTerminal = segment.some((e) => e.type === FLOW_TERMINAL_TYPE);
          if (!hasTerminal) {
            const startEntry = segment[0] as FlowStartEntry;
            const goal = startEntry.payload.goal;
            const engineId = startEntry.payload.engineId;
            const savedModel = startEntry.payload.model;

            // Build FlowInput[] from FLOW_RUN and FLOW_ANSWERS entries in order.
            const inputs: FlowInput[] = [];
            for (const e of segment.slice(1)) {
              if (e.type === FLOW_RUN_TYPE) {
                inputs.push({ kind: "run", stepId: e.payload.stepId, output: e.payload.output });
              } else if (e.type === FLOW_ANSWERS_TYPE) {
                inputs.push({ kind: "answers", stepId: e.payload.stepId, answers: e.payload.answers });
              }
            }

            const steps = buildSddFlow().filter((s) => s.id !== "confirm-ship" && s.id !== "ship");
            const res = replayFlow(steps, goal, inputs);

            if ("drift" in res) {
              appendTerminal(flowJournal, "version-mismatch");
            } else {
              const adapter = registry.get(engineId);
              const current: { cwd: string; adapter: EngineAdapter; model?: string; agentPrompt?: string; engine: FlowEngine; journal: Journal; pending?: { token: string; text: string; runId: string; revision: string } } = { cwd, adapter, engine: res.engine, journal: flowJournal };
              if (savedModel !== undefined) current.model = savedModel;
              if (typeof startEntry.payload.agentPrompt === "string") current.agentPrompt = startEntry.payload.agentPrompt;
              flow = current;

              const directive = current.engine.peek();
              if (directive.type === "done") {
                // Nothing to resume.
                flow = undefined;
              } else if (directive.type === "run") {
                resumableFlow = { title: directive.step.title, atKind: "run" };
              } else {
                // directive.type === "ask": recompute pending from the last FLOW_RUN in segment.
                let lastRunId: string | undefined;
                let lastRunOutput: string | undefined;
                for (let i = segment.length - 1; i >= 0; i--) {
                  const se = segment[i]!;
                  if (se.type === FLOW_RUN_TYPE) {
                    lastRunId = se.payload.runId;
                    lastRunOutput = se.payload.output;
                    break;
                  }
                }

                if (lastRunId && lastRunOutput !== undefined) {
                  try {
                    const snapshot = review(cwd, lastRunId);
                    const token = createHash("sha256")
                      .update(JSON.stringify([snapshot.revision, directive.step.id, directive.questions]))
                      .digest("hex");
                    current.pending = { token, text: lastRunOutput, runId: lastRunId, revision: snapshot.revision };
                    // P3-002: deliver ask payload in the open reply, NOT as an event.
                    // Live (non-recovered) flow.ask emissions in advance() remain unchanged.
                    const askPayload: AskPayload = { token, title: directive.step.title, questions: directive.questions, output: stripQuestions(lastRunOutput), diff: snapshot.diff };
                    resumableFlow = { title: directive.step.title, atKind: "ask", pendingAsk: true, ask: askPayload };
                  } catch {
                    // review() failed (repo changed/unreadable) — resume without pending ask.
                    resumableFlow = { title: directive.step.title, atKind: "ask", pendingAsk: false };
                  }
                } else {
                  // No runId available — can't revalidate; resume without pending ask.
                  resumableFlow = { title: directive.step.title, atKind: "ask", pendingAsk: false };
                }
              }
            }
          }
        }
      } catch (err) {
        process.stderr.write(`[gatewright] flow resume error: ${err instanceof Error ? err.message : String(err)}\n`);
      }

      return resumableFlow !== undefined ? { cwd, resumableFlow } : { cwd };
    }
    const cwd = assertProject(params);
    switch (method) {
      case "snapshot": {
        const catalog = projectSkills(cwd);
        const project = config.resolve(cwd);
        return {
        usage: aggregateUsage(cwd),
        linkedProjects: project.linkedProjects ?? [],
        skills: [...catalog.keys()].sort(),
        skillDetails: [...catalog.values()].map(({ frontmatter: { name, description } }) => ({ name, description })),
        agents: projectAgents(cwd),
        integrations: {
          mcp: Object.entries(managedMcpServers(cwd, false)).map(([name, server]) => ({
            name, type: server.type, ready: managedMcpReady(cwd, name, server),
            ...(server.type === "http" ? { url: server.url } : {}),
          })),
          packages: project.packages ?? [], jev: project.jev?.enabled === true,
        },
        providers: providers(cwd),
        hosts: (await registry.detectAll()).map(({ adapter, availability }) => ({
          id: adapter.id, name: adapter.name, installed: availability.installed, version: availability.version,
          hooks: true,
          configuration: terminalConfigStatus(cwd, z.enum(terminalHosts).parse(adapter.id)),
        })),
        operations: listOperations(cwd),
        };
      }
      case "terminal.preview": {
        const { host } = hostRequest.parse(params);
        const plans = planTerminal(cwd, host);
        return { revision: planRevision(plans), changes: plans.map(({ path, action, summary, blocked }) => ({ path, action, summary, blocked })) };
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
      case "integration.test": {
        const { name } = projectPath.extend({ name: z.union([z.literal("gatewright"), integrationName]) }).parse(params);
        if (name === "gatewright") {
          // Self-test: health recording does not apply (no managed server entry for gatewright itself).
          return testGatewrightMcp(cwd);
        }
        const servers = managedMcpServers(cwd, false);
        if (!Object.hasOwn(servers, name)) throw new Error("O MCP não está registrado neste projeto.");
        const t0 = performance.now();
        const diagnostic = await testManagedMcp(cwd, name);
        const latencyMs = "latencyMs" in diagnostic ? diagnostic.latencyMs : Math.round(performance.now() - t0);
        const checkedRevision = integrationRevision(cwd, name);
        if ("errorCode" in diagnostic) {
          recordHealthAttempt(cwd, name, { verification: "failed", errorCode: diagnostic.errorCode, checkedRevision });
        } else {
          recordHealthAttempt(cwd, name, { verification: "passed", latencyMs, checkedRevision });
        }
        const health = readHealth(cwd, name);
        return { ...diagnostic, ...health };
      }
      case "skill.save": {
        const { skill } = projectPath.extend({ skill: skillChangeSchema }).parse(params);
        if (projectSkills(cwd).has(skill.name)) throw new Error("Já existe uma skill com esse nome.");
        await applyChange(cwd, skill, changeRevision(cwd, skill));
        return null;
      }
      case "agent.preview":
      case "agent.save": {
        const { agent } = projectPath.extend({ agent: agentSchema }).parse(params);
        if (method === "agent.preview") return { instructions: composeAgent(cwd, agent) };
        saveAgent(cwd, agent);
        return null;
      }
      case "agent.update": {
        const { agent } = projectPath.extend({ agent: agentSchema }).parse(params);
        updateAgent(cwd, agent);
        return null;
      }
      case "agent.delete": {
        const { id } = projectPath.extend({ id: z.string().min(1) }).parse(params);
        deleteAgent(cwd, id);
        return null;
      }
      case "skills.list": {
        const { query, category, origin } = projectPath.extend({
          query: z.string().optional(),
          category: z.string().optional(),
          origin: z.enum(["bundled", "project"]).optional(),
        }).parse(params);
        const filter: { query?: string; category?: string; origin?: "bundled" | "project" } = {};
        if (query !== undefined) filter.query = query;
        if (category !== undefined) filter.category = category;
        if (origin !== undefined) filter.origin = origin;
        return listSkills(cwd, filter);
      }
      case "skills.detail": {
        const { name } = projectPath.extend({ name: z.string().min(1) }).parse(params);
        return skillDetail(cwd, name);
      }
      case "customize.propose": {
        const { providerId, model, prompt, reference } = projectPath.extend({
          providerId: z.string(), model: z.string().optional(), prompt: z.string().trim().min(1).max(4000),
          reference: z.string().trim().max(12_000).optional(),
        }).parse(params);
        const provider = providers(cwd).find((entry) => entry.id === providerId);
        if (!provider) throw new Error("Selecione um provedor configurado.");
        const input = reference ? `${prompt}\n\nDocumentação fornecida:\n${reference}` : prompt;
        const result = await complete(providerSchema.parse({ ...provider, model: model || provider.model }), input, AbortSignal.timeout(60_000), customizationPrompt());
        let change: Change;
        try { change = parseChange(result.text); }
        catch { return { message: result.text.slice(0, 1000) }; }
        checkProposalSources(change, input);
        const revision = changeRevision(cwd, change);
        if (proposals.size >= 20) proposals.clear();
        proposals.set(revision, { cwd, change });
        return { revision, change, plan: describeChange(cwd, change) };
      }
      case "customize.apply": {
        const { revision } = projectPath.extend({ revision: z.string() }).parse(params);
        const proposal = proposals.get(revision);
        if (!proposal || proposal.cwd !== cwd) throw new Error("A proposta expirou. Gere uma nova proposta.");
        if (active.size || flow) throw new Error("Encerre a tarefa antes de aplicar uma integração.");
        // P2-002: revision lock — reject concurrent apply of the same revision.
        if (inFlight.has(revision)) throw new Error("Esta proposta já está sendo aplicada.");
        inFlight.add(revision);
        applying = true;

        // P2-004: operation tracking for recipe-type changes.
        const recipeKinds = new Set(["npm-mcp", "container", "git-project", "graphify"]);
        const isRecipe = recipeKinds.has(proposal.change.kind);
        const operationId = isRecipe ? randomUUID() : undefined;

        try {
          if (isRecipe && operationId !== undefined) {
            const steps = describeChange(cwd, proposal.change).steps.map((label, i) => ({ id: String(i), label }));
            startOperation(cwd, { id: operationId, revision, recipeKind: proposal.change.kind, steps });
            send({ event: "integration.progress", cwd, data: { operationId, seq: 0, step: { status: "running" } } });
          }

          // P2-002: delegate to core applyIntegration (records CONFIRMED/APPLIED/FAILED).
          // applyIntegration may swallow the final-write failure path; we cannot replicate
          // the warning return in that case — noted as a known gap vs. original inline journal.
          try {
            await applyIntegration({ cwd, change: proposal.change, revision });
          } catch (error) {
            if (isRecipe && operationId !== undefined) {
              finishOperation(cwd, operationId, "failed");
              send({ event: "integration.progress", cwd, data: { operationId, seq: -1, step: { status: "failed" } } });
            }
            throw error;
          }

          proposals.delete(revision);

          if (isRecipe && operationId !== undefined) {
            const plan = describeChange(cwd, proposal.change);
            plan.steps.forEach((_label, i) => {
              recordStep(cwd, operationId, { stepId: String(i), status: "succeeded" });
            });
            finishOperation(cwd, operationId, "succeeded");
            send({ event: "integration.progress", cwd, data: { operationId, seq: plan.steps.length, step: { status: "succeeded" } } });
          }

          return null;
        } finally {
          applying = false;
          inFlight.delete(revision);
        }
      }
      case "integration.operation.get": {
        const { operationId } = projectPath.extend({ operationId: z.string().min(1) }).parse(params);
        return operationSnapshot(cwd, operationId);
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
        const askStepId = directive.step.id;
        const next = current.engine.submitAnswers(answers);
        appendAnswers(current.journal, { stepId: askStepId, answers });
        if (next.type === "done" && next.aborted) {
          appendTerminal(current.journal, "aborted");
          flow = undefined;
          send({ event: "flow.done", cwd, data: "Revisão recusada. O fluxo foi encerrado." });
          return {};
        }
        return advance(current, { runId: pending.runId, text: pending.text });
      }
      case "flow.stop":
        if (flow?.cwd === cwd) {
          appendTerminal(flow.journal, "stopped");
          flow = undefined;
          for (const handle of active.values()) handle.cancel();
          send({ event: "flow.done", cwd, data: "Fluxo encerrado." });
        }
        return null;
      case "run":
      case "flow.start": {
        const { engine, model, prompt, agentId } = projectPath.extend({
          engine: z.string(), model: z.string().optional(), prompt: z.string().trim().min(1).max(48_000), agentId: z.string().optional(),
        }).parse(params);
        if (active.size || flow) throw new Error("Aguarde ou encerre o trabalho atual antes de iniciar outro.");
        const provider = providers(cwd).find((entry) => `provider:${entry.id}` === engine);
        const adapter = provider ? providerAdapter(provider) : registry.get(engine);
        const agent = agentId ? projectAgents(cwd).find((item) => item.id === agentId) : undefined;
        if (agentId && !agent) throw new Error("O agente não está disponível neste projeto.");
        const agentPrompt = agent ? composeAgent(cwd, agent) : undefined;
        if (method === "run") return { runId: start(cwd, adapter, prompt, model, agentPrompt).id };
        if (provider) throw new Error("Escolha um agente de terminal para executar o fluxo com ferramentas.");
        const steps = buildSddFlow().filter((step) => step.id !== "confirm-ship" && step.id !== "ship");
        const flowJournal = openFlowJournal(cwd);
        const payload = { ...(model ? { model } : {}), ...(agentPrompt ? { agentPrompt } : {}) };
        const current = { cwd, adapter, ...payload, engine: new FlowEngine(steps, prompt), journal: flowJournal };
        flow = current;
        appendStart(flowJournal, { goal: prompt, flowKind: "sdd", engineId: engine, ...payload });
        try { return advance(current); }
        catch (error) { flow = undefined; throw error; }
      }
      case "flow.resume": {
        const current = flow;
        if (!current || current.cwd !== cwd) throw new Error("Nenhum fluxo para retomar.");
        const directive = current.engine.peek();
        if (directive.type !== "run") throw new Error("Nenhum fluxo para retomar.");
        const next = advance(current);
        if (next.runId) send({ event: "flow.run", cwd, data: next.runId });
        return next;
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
