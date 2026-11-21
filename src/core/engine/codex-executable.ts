import { delimiter, isAbsolute, join } from "node:path";
import { existsSync, realpathSync } from "node:fs";

export function codexExecutable(): { command: string; prefix: string[] } {
  if (process.platform === "win32") {
    for (const directory of (process.env["PATH"] ?? "").split(delimiter).filter(isAbsolute)) {
      const native = join(directory, "codex.exe"),
        npm = join(directory, "node_modules", "@openai", "codex", "bin", "codex.js");
      if (existsSync(native)) return { command: native, prefix: [] };
      if (existsSync(npm)) return { command: process.execPath, prefix: [realpathSync(npm)] };
    }
  }
  return { command: "codex", prefix: [] };
}
