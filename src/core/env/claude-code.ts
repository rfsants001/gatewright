// Claude Code machine overview — what's installed and what it carries: MCP servers,
// skills, and plugins. MCPs are read from the known JSON; skills/plugins are
// best-effort (on-disk layout varies across versions), so missing paths just yield
// empty lists — never a crash, never a fabricated entry.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { listMcpServers, type McpServerEntry } from "../project/mcp.js";

export interface SkillRef {
  name: string;
  source: "user" | "project" | "plugin";
}

export interface PluginRef {
  name: string;
}

export interface CommandRef {
  name: string;
  source: "user" | "project";
}

export interface ClaudeCodeOverview {
  installed: boolean;
  configDir: string | null;
  mcps: McpServerEntry[];
  /** Installed skill directories (incl. plugin-provided). */
  skills: SkillRef[];
  /** Custom slash commands authored by the user (~/.claude/commands/*.md). */
  commands: CommandRef[];
  plugins: PluginRef[];
  /** Sections detected on a best-effort basis (layout may vary by version). */
  bestEffort: string[];
}

export interface ClaudeOverviewOptions {
  home?: string;
  cwd?: string;
  commandProbe?: (bin: string, args?: string[]) => string | null;
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((e) => !e.startsWith(".") && statSync(join(dir, e)).isDirectory());
  } catch {
    return [];
  }
}

function scanSkills(dir: string, source: SkillRef["source"]): SkillRef[] {
  return subdirs(dir)
    .filter((name) => existsSync(join(dir, name, "SKILL.md")))
    .map((name) => ({ name, source }));
}

function scanCommands(dir: string, source: CommandRef["source"]): CommandRef[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ name: f.replace(/\.md$/, ""), source }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  } catch {
    return [];
  }
}

export function claudeCodeOverview(opts: ClaudeOverviewOptions = {}): ClaudeCodeOverview {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const probe = opts.commandProbe ?? (() => null);
  const configDirPath = join(home, ".claude");
  const hasConfig = existsSync(configDirPath);
  const installed = hasConfig || probe("claude", ["--version"]) !== null;

  const skills: SkillRef[] = [
    ...scanSkills(join(configDirPath, "skills"), "user"),
    ...scanSkills(join(cwd, ".claude", "skills"), "project"),
  ];

  // Plugin skills (best-effort): ~/.claude/plugins/<plugin>/skills/<skill>/SKILL.md
  const pluginsDir = join(configDirPath, "plugins");
  const plugins: PluginRef[] = subdirs(pluginsDir).map((name) => ({ name }));
  for (const plugin of plugins) {
    skills.push(...scanSkills(join(pluginsDir, plugin.name, "skills"), "plugin"));
  }

  const commands: CommandRef[] = [
    ...scanCommands(join(configDirPath, "commands"), "user"),
    ...scanCommands(join(cwd, ".claude", "commands"), "project"),
  ];

  return {
    installed,
    configDir: hasConfig ? configDirPath : null,
    mcps: listMcpServers({ cwd, home }),
    skills,
    commands,
    plugins,
    bestEffort: ["plugins", "plugin skills"],
  };
}
