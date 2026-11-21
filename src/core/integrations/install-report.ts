export interface InstallEvent {
  stepId: string;
  label: string;
  status: "running" | "succeeded" | "failed" | "skipped" | "unknown";
  evidence?: Record<string, string>;
  errorCode?: string;
}
export interface InstallReporter {
  operationId: string;
  report: (event: InstallEvent) => void;
}
