// Headless, dependency-free text output for the read-only / scriptable commands
// (doctor, projects, mcp, skills, history, non-interactive rollback). The rich
// interactive experience is the Ink app; these are for pipes, CI and quick checks.

import { homedir } from "node:os";
import { join } from "node:path";
import { detect } from "../core/env/detect.js";
import { ProjectRegistry } from "../core/project/registry.js";
import { listMcpServers } from "../core/project/mcp.js";
import { SkillCatalog } from "../core/skills/catalog.js";
import { ConfigHistory } from "../core/history/config-history.js";
import { rollbackRevision } from "../core/history/rollback.js";
import type { CheckStatus } from "../core/env/types.js";

const line = (s: string): void => void process.stdout.write(`${s}\n`);
const short = (p: string): string => p.replace(homedir(), "~");
const MARK: Record<CheckStatus, string> = { ok: "[ok]  ", warn: "[warn]", missing: "[ ]   " };

export async function textDoctor(): Promise<number> {
  const report = await detect();
  for (const group of report.groups) {
    line(group.title);
    for (const c of group.checks) {
      const fix = c.fix && c.status !== "ok" ? `  → ${c.fix}` : "";
      line(`  ${MARK[c.status]} ${c.label}${c.detail ? ` — ${c.detail}` : ""}${fix}`);
    }
  }
  return 0;
}

export function textProjects(): number {
  const projects = new ProjectRegistry().list();
  if (projects.length === 0) {
    line("no projects configured yet — run gate init");
    return 0;
  }
  for (const p of projects) line(`${p.name}  ${short(p.path)}  (${p.configuredAt.slice(0, 10)})`);
  return 0;
}

export function textMcp(): number {
  const servers = listMcpServers();
  if (servers.length === 0) {
    line("no MCP servers in .mcp.json or ~/.claude.json");
    return 0;
  }
  for (const s of servers) line(`${s.name}  ${[s.command, ...s.args].join(" ")}  (${short(s.source)})`);
  return 0;
}

export function textSkills(): number {
  const root = process.env.GATEWRIGHT_SKILLS_DIR ?? join(process.cwd(), "skills");
  const catalog = new SkillCatalog(root);
  const skills = catalog.list();
  if (skills.length === 0) {
    line(`no skills in ${root}`);
    return 0;
  }
  for (const s of skills) line(`${s.frontmatter.name}  [${s.frontmatter.skillKind}]  ${s.frontmatter.description}`);
  for (const p of catalog.problems()) process.stderr.write(`skipped ${p.dir}: ${p.message}\n`);
  return 0;
}

export function textHistory(): number {
  const revs = new ConfigHistory().list();
  if (revs.length === 0) {
    line("no configuration changes recorded yet");
    return 0;
  }
  for (const r of revs) {
    line(`${r.id}  ${r.at.slice(0, 16).replace("T", " ")}  ${r.kind}  ${r.summary}`);
    for (const f of r.files) line(`    ${f.action}  ${short(f.path)}`);
  }
  return 0;
}

export function textRollback(id?: string): number {
  const result = rollbackRevision(new ConfigHistory(), id ? { id } : {});
  if (!result.ok) {
    process.stderr.write(`gate rollback: ${result.reason}\n`);
    return 1;
  }
  line(`rolled back ${result.reverted?.id} (recorded ${result.recorded?.id})`);
  return 0;
}
