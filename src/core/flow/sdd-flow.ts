// The default end-to-end flow (SDD-centric, no PRD/TRD): goal → plan → human sign-off
// → implement → review → confirm → ship. State lives on disk (.specs/) between runs,
// since each run is a fresh one-shot engine process. The ship step pushes and then asks
// a confirm before opening the PR, so there's a human gate before push AND before the PR.

import type { FlowStep } from "./flow.js";

export function buildSddFlow(): FlowStep[] {
  return [
    {
      id: "plan",
      kind: "run",
      title: "Plan (SDD)",
      prompt: (c) =>
        `Goal: ${c.goal}\n\nFollow the gate-flow and gate-sdd-phase skills: produce a concise spec and atomic tasks (written to .specs/) for this goal. ` +
        `If anything is ambiguous or needs a decision, ask me with a <gate-ask> block instead of guessing. Do NOT write code yet.`,
    },
    {
      id: "signoff",
      kind: "gate",
      title: "Sign off the plan",
      questions: () => [{ id: "approve", type: "confirm", prompt: "Approve the plan and start implementing?" }],
    },
    {
      id: "implement",
      kind: "run",
      title: "Implement",
      prompt: (c) =>
        `Implement the plan recorded in .specs/ for: ${c.goal}. Work task by task per gate-sdd-execute; keep the build and tests green; one task = one commit. ` +
        `Ask via <gate-ask> only if you hit a real decision.`,
    },
    {
      id: "review",
      kind: "run",
      title: "Review",
      prompt: () => `Review the changes with gate-code-review: correctness first, then simplification. Fix what you find and keep tests green.`,
    },
    {
      id: "confirm-ship",
      kind: "gate",
      title: "Confirm ship",
      questions: () => [{ id: "ship", type: "confirm", prompt: "Push the branch and open a PR?" }],
    },
    {
      id: "ship",
      kind: "run",
      title: "Ship",
      prompt: (c) =>
        `Create a branch, commit the work, and push it for: ${c.goal}. Use gate-pr-author for the PR description. ` +
        `Before actually opening the PR, show the title + body and confirm with a <gate-ask> confirm. Stop at the human merge gate — do not merge.`,
    },
  ];
}
