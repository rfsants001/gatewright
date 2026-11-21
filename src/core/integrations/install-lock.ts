import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** The same project mutex covers desktop, MCP installation and recovery. */
export function acquireInstallationLock(cwd: string, operationId: string): () => void {
  const mutex = join(cwd, ".gatewright", "integration-apply.lock"),
    token = randomUUID();
  mkdirSync(join(cwd, ".gatewright"), { recursive: true });
  try {
    mkdirSync(mutex);
  } catch {
    throw new Error(
      "Outra instalação está em andamento ou foi interrompida. Reconcilie a operação antes de tentar novamente.",
    );
  }
  try {
    writeFileSync(join(mutex, "owner.json"), JSON.stringify({ pid: process.pid, operationId, token }));
  } catch (error) {
    rmSync(mutex, { recursive: true, force: true });
    throw error;
  }
  return () => {
    const owner = JSON.parse(readFileSync(join(mutex, "owner.json"), "utf8")) as { token?: string };
    if (owner.token === token) rmSync(mutex, { recursive: true });
  };
}
