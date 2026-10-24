// Inline approval card: when the FlowEngine pauses a gate/tool for human approval
// (Phase 18 fail-safe), this renders at the exact spot in the transcript — not a
// detached footer. Keys are wired by the cockpit keymap (feat run-cockpit-shell);
// here we render the request and its options.

import { Box, Text } from "ink";
import type { ReactElement } from "react";

export interface PendingApproval {
  /** The tool/action awaiting approval (e.g. "Write", "shell"). */
  tool: string;
  /** What it would act on (e.g. ".env.production", "rm -rf build"). */
  target?: string;
}

/** One-line description of the pending action: "Write .env.production". */
export function permissionSummary(action: PendingApproval): string {
  return action.target ? `${action.tool} ${action.target}` : action.tool;
}

export function PermissionRow({ action }: { action: PendingApproval }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color="yellow" bold>{`⚠ Approval required: ${permissionSummary(action)}`}</Text>
      <Text dimColor>{"  [a] allow  [d] deny  [s] allow-session"}</Text>
    </Box>
  );
}
