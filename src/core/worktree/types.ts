// Worktree-per-run contracts.

export interface WorktreeRecord {
  runSlug: string;
  /** Absolute path of the git worktree directory. */
  path: string;
  /** Branch checked out in the worktree. */
  branch: string;
}

export type WorktreeErrorCode = "UNSAFE_SLUG" | "GIT_FAILED" | "NOT_A_REPO";

export class WorktreeError extends Error {
  readonly code: WorktreeErrorCode;
  constructor(code: WorktreeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WorktreeError";
    this.code = code;
  }
}
