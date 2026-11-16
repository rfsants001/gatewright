import { join } from "node:path";
import { z } from "zod";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";
import { loadGateSkills } from "./gate-catalog.js";

export const agentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  name: z.string().trim().min(1).max(70),
  goal: z.string().trim().min(1).max(1000),
  skills: z.array(z.string().min(1).max(100)).min(1).max(12)
    .refine((skills) => new Set(skills).size === skills.length),
}).strict();
export type AgentProfile = z.infer<typeof agentSchema>;

const config = new ConfigStore(new FileArtifactStore());

export function projectSkills(cwd: string) {
  return new Map([...loadGateSkills().list(), ...loadGateSkills(join(cwd, ".gatewright", "skills")).list()]
    .map((skill) => [skill.frontmatter.name, skill]));
}

export function projectAgents(cwd: string): AgentProfile[] {
  return (config.read("project", cwd).agents ?? []).flatMap((item) => {
    const parsed = agentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function composeAgent(cwd: string, profile: AgentProfile): string {
  const catalog = projectSkills(cwd);
  const instructions = profile.skills.map((name) => {
    const skill = catalog.get(name);
    if (!skill) throw new Error(`A skill "${name}" não está disponível neste projeto.`);
    return `## ${name}\n${skill.body}`;
  });
  const text = [`Perfil: ${profile.name}\nObjetivo: ${profile.goal}`, ...instructions].join("\n\n");
  if (Buffer.byteLength(text, "utf8") > 20_000) {
    throw new Error("As instruções combinadas excedem o limite de 20 KB. Escolha menos skills.");
  }
  return text;
}

export function saveAgent(cwd: string, profile: AgentProfile): void {
  composeAgent(cwd, profile);
  const previous = projectAgents(cwd);
  if (previous.some((agent) => agent.id === profile.id)) throw new Error("Já existe um agente com esse identificador.");
  config.write("project", { agents: [...previous, profile] }, cwd);
}
