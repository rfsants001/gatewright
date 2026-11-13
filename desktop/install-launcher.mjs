import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/cli/gate.js", import.meta.url));
const applications = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "applications");
const path = join(applications, "io.gatewright.Desktop.desktop");
const quote = (value) => '"' + value.replaceAll("%", "%%").replace(/[`"$\\]/g, "\\\\$&") + '"';
mkdirSync(applications, { recursive: true });
writeFileSync(path, [
  "[Desktop Entry]", "Type=Application", "Name=Gatewright",
  "Comment=Gerencie projetos, execuções e integrações de agentes",
  `Exec=${quote(process.execPath)} ${quote(entry)} desktop`,
  "Icon=applications-development", "Terminal=false", "Categories=Development;", "",
].join("\n"));
process.stdout.write(path + "\n");
