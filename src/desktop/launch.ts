import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gateScript } from "../core/init/gate-bin.js";

export function launchDesktop(args: string[]): Promise<number> {
  const main = fileURLToPath(new URL("./main.mjs", import.meta.url));
  const require = createRequire(import.meta.url);
  let executable: string;
  try {
    executable = require("electron") as string;
  } catch (error) {
    process.stderr.write(`Electron indisponível. Rode npm ci antes de iniciar a interface. ${String(error)}\n`);
    return Promise.resolve(1);
  }
  const child = spawn(executable, [main, process.execPath, gateScript(), ...args], { stdio: "inherit" });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      process.stderr.write(`Não foi possível abrir o Gatewright: ${error.message}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
