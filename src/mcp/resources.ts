// MCP resources — expose gate://usage and gate://config as read-only resources.
// All payloads pass through the secret redactor before being served.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FileArtifactStore } from "../core/artifact-store/artifact-store.js";
import { ConfigStore } from "../core/config/config-store.js";
import { aggregateUsage } from "../core/run/usage.js";
import { redact } from "./redact.js";

const USAGE_URI = "gate://usage";
const CONFIG_URI = "gate://config";

/**
 * Register the `gate://usage` resource on `server`.
 * Returns a per-cwd snapshot of aggregated token usage, grouped by model and run.
 * The payload is redacted before being served.
 */
export function registerUsageResource(server: McpServer, cwd: string = process.cwd()): void {
  server.registerResource(
    "gate-usage",
    USAGE_URI,
    { description: "Aggregated token usage for this project, grouped by model and run.", mimeType: "application/json" },
    (_uri) => {
      const snapshot = aggregateUsage(cwd);
      const safe = redact(snapshot);
      return {
        contents: [
          {
            uri: USAGE_URI,
            mimeType: "application/json",
            text: JSON.stringify(safe, null, 2),
          },
        ],
      };
    },
  );
}

/**
 * Register the `gate://config` resource on `server`.
 * Returns the merged gate+project config with secrets redacted.
 */
export function registerConfigResource(server: McpServer, cwd: string = process.cwd()): void {
  const store = new FileArtifactStore();
  const configStore = new ConfigStore(store);

  server.registerResource(
    "gate-config",
    CONFIG_URI,
    { description: "Effective Gatewright configuration (gate ⊕ project), secrets redacted.", mimeType: "application/json" },
    (_uri) => {
      const config = configStore.resolve(cwd);
      const safe = redact(config);
      return {
        contents: [
          {
            uri: CONFIG_URI,
            mimeType: "application/json",
            text: JSON.stringify(safe, null, 2),
          },
        ],
      };
    },
  );
}
