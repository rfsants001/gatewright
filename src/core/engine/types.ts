// Engine contract — how the gate drives a code-AI (Claude Code, Codex, OpenCode)
// headlessly. The runner talks to this interface, never to a CLI directly, so the
// gate's MCP (and therefore the gates + Jev) are always in the loop.

/**
 * How an engine authenticates. `inherited-cli` means we shell out to the user's
 * already-logged-in binary and ride their subscription (no API key). `api-key`
 * engines need an explicit credential (LiteLLM etc. — backlog, enum only for now).
 */
export type EngineAuthModel = "inherited-cli" | "api-key";

/** Everything the gate needs to launch one headless run. */
export interface EngineRunOptions {
  prompt: string;
  cwd: string;
  /** Path to the gate-only MCP config forced via --strict-mcp-config. */
  mcpConfigPath: string;
  /** Gate skills injected into the engine (e.g. --append-system-prompt). */
  systemPrompt?: string;
  /** Extra directories granted as context (e.g. --add-dir). */
  contextDirs?: string[];
  allowedTools?: string[];
  permissionMode?: string;
  model?: string;
}

/** A concrete process invocation produced by an adapter. */
export interface EngineCommand {
  bin: string;
  args: string[];
  env?: Record<string, string>;
}

/** Result of probing an engine on this machine. */
export interface EngineAvailability {
  installed: boolean;
  /** Best-effort, never consumes tokens; undefined when unknown. */
  loggedIn?: boolean;
  version?: string;
  detail?: string;
}

/** Token/cost usage carried by `usage` events (and the final result). */
export interface EngineUsage {
  tokensIn: number;
  tokensOut: number;
  /** Cache-read input tokens; 0 when none/unknown. */
  cacheRead: number;
  /** Total cost in USD, when the engine reports it (final result only). */
  costUsd?: number;
}

/** A normalized event parsed from an engine's output stream. */
export interface EngineEvent {
  kind: "assistant" | "reasoning" | "tool_use" | "tool_result" | "result" | "system" | "error" | "usage" | "raw";
  /** Human-readable text for assistant/reasoning/result/error/system/raw. */
  text?: string;
  /** Tool name for tool_use / tool_result. */
  tool?: string;
  /** What the tool acted on (file path, command, pattern) or a short result preview. */
  detail?: string;
  /** Token/cost usage for `usage` events (or attached to the final result). */
  usage?: EngineUsage;
  /** The underlying parsed line, for replay/debug. */
  raw?: unknown;
}

/** Contract every engine adapter implements. */
export interface EngineAdapter {
  readonly id: string;
  readonly name: string;
  readonly authModel: EngineAuthModel;
  /** Probe the machine. Must not consume tokens or spawn a real run. */
  detect(): Promise<EngineAvailability>;
  /** Pure: same options → same command. Throws EngineNotSupportedError for stubs. */
  buildHeadlessCommand(opts: EngineRunOptions): EngineCommand;
  /**
   * Parse one line of the engine's stream into normalized event(s). Returns null
   * to skip, a single event, or several when one line carries multiple parts
   * (e.g. a message with reasoning + text + usage).
   */
  parseStreamLine(line: string): EngineEvent | EngineEvent[] | null;
}

/** Thrown by detectable-but-not-yet-runnable adapters (Codex, OpenCode). */
export class EngineNotSupportedError extends Error {
  readonly engineId: string;
  constructor(engineId: string) {
    super(`engine '${engineId}' is detected but not yet supported for headless runs`);
    this.name = "EngineNotSupportedError";
    this.engineId = engineId;
  }
}
