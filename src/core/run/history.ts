import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openRunJournal } from "../engine/run-journal.js";
import { ControlStateMachine } from "../control/control-state-machine.js";

export function listRunHistory(cwd: string) {
  const directory = join(cwd, ".gatewright", "runs");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((id) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id))
    .flatMap((runId) => {
      try {
        const journal = openRunJournal(cwd, runId).journal;
        if (!journal.verify().ok) return [];
        const events = journal.read();
        const context = events.find((event) => event.type === "RUN_CONTEXT")?.payload as
          | { prompt?: string; agentId?: string; memorySnapshot?: { items?: unknown[] } }
          | undefined;
        return events.length
          ? [
              {
                runId,
                title: context?.prompt?.slice(0, 140) ?? runId,
                state: new ControlStateMachine(journal).current(),
                at: events[0]!.at,
                agentId: context?.agentId ?? null,
                memories: context?.memorySnapshot?.items?.length ?? 0,
              },
            ]
          : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.runId.localeCompare(b.runId));
}
