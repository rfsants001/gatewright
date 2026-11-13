import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gateScript } from "../core/init/gate-bin.js";

export function launchDesktop(args: string[]): Promise<number> {
  const script = fileURLToPath(new URL("../../desktop/gatewright.py", import.meta.url));
  const child = spawn("python3", [script, process.execPath, gateScript(), ...args], { stdio: "inherit" });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      process.stderr.write(`Could not start Gatewright Desktop: ${error.message}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
