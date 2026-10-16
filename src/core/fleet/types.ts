// Fleet contracts — workers across machines and the coordinator's assignment record.

export interface Worker {
  id: string;
  /** Machine/host identity, e.g. "mbp-rafa" or a container id. */
  host: string;
  capabilities: string[];
  /** Epoch ms of the last heartbeat. */
  heartbeatAt: number;
}

/** Which worker currently drives a run, guarded by a fencing token. */
export interface Assignment {
  runSlug: string;
  workerId: string;
  /** Monotonically increasing; a lower token can never win. */
  fencingToken: number;
}

export type FleetErrorCode = "UNKNOWN_WORKER";

export class FleetError extends Error {
  readonly code: FleetErrorCode;
  constructor(code: FleetErrorCode, message: string) {
    super(message);
    this.name = "FleetError";
    this.code = code;
  }
}
