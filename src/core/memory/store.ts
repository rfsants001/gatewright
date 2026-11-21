import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { Journal } from "../journal/journal.js";

export const memoryScope = z.enum(["user", "project", "run"]);
const safeId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export const memoryInput = z
  .object({
    id: safeId.optional(),
    version: z.number().int().nonnegative().default(0),
    scope: memoryScope,
    runId: safeId.optional(),
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(16_000),
    type: z.enum(["decision", "preference", "learning"]),
    origin: z.enum(["human", "ai-suggested"]).default("human"),
    recipients: z.array(safeId).max(32).default([]),
  })
  .strict();
export const memoryRef = z
  .object({ id: safeId, scope: memoryScope, version: z.number().int().positive() })
  .strict();
export const memoryRecord = memoryInput.extend({
  id: safeId,
  version: z.number().int().positive(),
  schemaVersion: z.literal(1),
  projectId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
});
export type MemoryRecord = z.infer<typeof memoryRecord>;
export type MemoryRef = z.infer<typeof memoryRef>;
export interface MemorySnapshot {
  schemaVersion: 1;
  resolvedAt: string;
  items: MemoryRecord[];
  text: string;
  bytes: number;
}

/** One hash-chained event file per version. Atomic hard-link publication is a cross-process CAS. */
export class MemoryStore {
  readonly cwd: string;
  constructor(
    cwd: string,
    readonly userHome = process.env["GATEWRIGHT_HOME"] ?? join(homedir(), ".gatewright"),
  ) {
    this.cwd = realpathSync(cwd);
  }
  private directory(scope: z.infer<typeof memoryScope>): string {
    const base = scope === "user" ? this.userHome : join(this.cwd, ".gatewright");
    for (const directory of [base, join(base, "memory"), join(base, "memory", scope)]) {
      if (existsSync(directory) && !lstatSync(directory).isDirectory())
        throw new Error("Memórias precisam ficar em diretórios locais, sem links simbólicos.");
    }
    return join(base, "memory", scope);
  }
  private journal(scope: z.infer<typeof memoryScope>, id: string): Journal {
    safeId.parse(id);
    const directory = join(this.directory(scope), id);
    const read = () => {
      if (!existsSync(directory)) return null;
      if (!lstatSync(directory).isDirectory()) throw new Error("Pasta de memória inválida.");
      const names = readdirSync(directory)
        .filter((name) => /^v[0-9]{6}\.json$/.test(name))
        .sort();
      if (names.length > 1000) throw new Error("A memória excede 1.000 revisões. Arquive seu histórico.");
      const events = names.map((name, index) => {
        if (name !== `v${String(index + 1).padStart(6, "0")}.json`)
          throw new Error("Histórico de memória incompleto.");
        const path = join(directory, name);
        if (!lstatSync(path).isFile() || statSync(path).size > 96_000)
          throw new Error("Artefato de memória inválido.");
        return JSON.parse(readFileSync(path, "utf8")) as { payload: { version: number } };
      });
      return JSON.stringify(events);
    };
    const store = new FileArtifactStore();
    return new Journal(
      {
        read,
        exists: () => existsSync(directory),
        recover: () => {},
        write: (_path, raw) => {
          const events = JSON.parse(String(raw)) as { payload: { version: number } }[];
          const last = events.at(-1);
          if (!last || last.payload.version !== events.length)
            throw new Error("A memória mudou. Atualize antes de salvar.");
          mkdirSync(directory, { recursive: true });
          if (!lstatSync(directory).isDirectory()) throw new Error("Pasta de memória inválida.");
          const staging = join(directory, `.event-${randomUUID()}`);
          const destination = join(directory, `v${String(events.length).padStart(6, "0")}.json`);
          store.write(staging, JSON.stringify(last));
          try {
            linkSync(staging, destination);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST")
              throw new Error("A memória mudou. Atualize antes de salvar.");
            throw error;
          } finally {
            rmSync(staging, { force: true });
          }
        },
      },
      directory,
    );
  }
  private current(scope: z.infer<typeof memoryScope>, id: string): MemoryRecord | undefined {
    const journal = this.journal(scope, id);
    if (!journal.verify().ok)
      throw new Error("O histórico da memória está inválido. Restaure uma cópia antes de editar.");
    const last = journal.read().at(-1);
    return last ? memoryRecord.parse(last.payload) : undefined;
  }
  list(
    opts: { includeUser?: boolean | undefined; runId?: string | undefined; query?: string | undefined } = {},
  ): MemoryRecord[] {
    const scopes: z.infer<typeof memoryScope>[] = opts.includeUser
      ? ["project", "run", "user"]
      : ["project", "run"];
    const records: MemoryRecord[] = [];
    for (const scope of scopes) {
      const directory = this.directory(scope);
      if (!existsSync(directory)) continue;
      const files = readdirSync(directory).filter((name) => safeId.safeParse(name).success);
      if (files.length > 1000) throw new Error("A biblioteca excede 1.000 memórias por escopo.");
      for (const name of files) {
        const record = this.current(scope, name);
        if (!record || record.deletedAt || (scope !== "user" && record.projectId !== this.cwd)) continue;
        if (scope === "run" && (!opts.runId || record.runId !== opts.runId)) continue;
        const query = opts.query?.toLocaleLowerCase();
        if (!query || `${record.title} ${record.body}`.toLocaleLowerCase().includes(query))
          records.push(record);
      }
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  upsert(value: unknown): MemoryRecord {
    const input = memoryInput.parse(value);
    if (input.scope === "run" && !input.runId)
      throw new Error("Informe a execução para a memória de tarefa.");
    const id = input.id ?? randomUUID();
    return (() => {
      const previous = this.current(input.scope, id);
      if ((previous?.version ?? 0) !== input.version || previous?.deletedAt)
        throw new Error("A memória mudou. Atualize antes de salvar.");
      const at = new Date().toISOString();
      const record = memoryRecord.parse({
        ...input,
        id,
        version: input.version + 1,
        schemaVersion: 1,
        ...(input.scope !== "user" ? { projectId: this.cwd } : {}),
        createdAt: previous?.createdAt ?? at,
        updatedAt: at,
      });
      this.journal(input.scope, id).append({ type: "MEMORY_SAVED", payload: record, at });
      return record;
    })();
  }
  delete(value: unknown): void {
    const ref = memoryRef.parse(value);
    (() => {
      const previous = this.current(ref.scope, ref.id);
      if (!previous || previous.deletedAt || previous.version !== ref.version)
        throw new Error("A memória mudou. Atualize antes de excluir.");
      const at = new Date().toISOString();
      this.journal(ref.scope, ref.id).append({
        type: "MEMORY_DELETED",
        payload: { ...previous, version: previous.version + 1, updatedAt: at, deletedAt: at },
        at,
      });
    })();
  }
  resolve(
    refs: MemoryRef[],
    opts: { agentId?: string; runId?: string; basePrompt?: string } = {},
  ): MemorySnapshot {
    const parsed = z.array(memoryRef).max(32).parse(refs);
    const keys = parsed.map((ref) => `${ref.scope}:${ref.id}`);
    if (new Set(keys).size !== keys.length) throw new Error("Selecione cada memória apenas uma vez.");
    const items = parsed.map((ref) => {
      const record = this.current(ref.scope, ref.id);
      if (!record || record.deletedAt || record.version !== ref.version)
        throw new Error("Uma memória selecionada mudou. Revise o contexto da tarefa.");
      if (record.scope !== "user" && record.projectId !== this.cwd)
        throw new Error("Memória de outro projeto.");
      if (record.scope === "run" && record.runId !== opts.runId)
        throw new Error("Esta memória pertence a outra execução.");
      if (record.recipients.length && (!opts.agentId || !record.recipients.includes(opts.agentId)))
        throw new Error("A memória não está disponível para o agente selecionado.");
      return record;
    });
    const text = items
      .map((record) => `## ${record.title} [${record.scope}:${record.id}@${record.version}]\n${record.body}`)
      .join("\n\n");
    const bytes = Buffer.byteLength([opts.basePrompt, text].filter(Boolean).join("\n\n"), "utf8");
    if (bytes > 20_000)
      throw new Error("Agente e memórias excedem 20 KB. Reduza o contexto antes de iniciar.");
    return { schemaVersion: 1, resolvedAt: new Date().toISOString(), items, text, bytes };
  }
}
