// Worktree decision — should this run get its own isolated worktree? Deterministic:
// only a native bound run under an enabled policy warrants isolation; ordinary dev
// sessions run in place.

export interface WorktreeDecisionInput {
  /** The run is a native, bound controller run (not an ad-hoc dev session). */
  nativeBound: boolean;
  /** Worktree-per-run policy is turned on. */
  policyEnabled: boolean;
}

export function shouldUseWorktree(input: WorktreeDecisionInput): boolean {
  return input.nativeBound && input.policyEnabled;
}
