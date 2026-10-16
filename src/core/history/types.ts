// Config-history model — every change the CLI makes to a config file is captured as
// a revision, with enough before/after content to be fully reverted.

export type RevisionKind = "configure" | "fix" | "rollback";

export interface FileChange {
  path: string;
  action: "create" | "merge" | "overwrite" | "delete";
  /** File content before the change; null = the file did not exist. */
  before: string | null;
  /** File content after the change; null = the file was deleted. */
  after: string | null;
}

export interface Revision {
  id: string;
  /** ISO-8601 timestamp. */
  at: string;
  kind: RevisionKind;
  summary: string;
  /** Project root this revision applies to, when known. */
  project?: string;
  files: FileChange[];
  /** For rollback revisions: the id of the revision being reverted. */
  reverts?: string;
}
