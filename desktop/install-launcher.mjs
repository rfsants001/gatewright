import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/cli/gate.js", import.meta.url));
const applications = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "applications");
const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const path = join(applications, "io.gatewright.Desktop.desktop");
const quote = (value) => '"' + value.replaceAll("%", "%%").replace(/[`"$\\]/g, "\\\\$&") + '"';
mkdirSync(applications, { recursive: true });
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const icons = join(dataHome, "icons", "hicolor", `${size}x${size}`, "apps");
  mkdirSync(icons, { recursive: true });
  copyFileSync(fileURLToPath(new URL(`../dist/desktop/icons/${size}x${size}.png`, import.meta.url)), join(icons, "io.gatewright.Desktop.png"));
}
writeFileSync(path, [
  "[Desktop Entry]", "Type=Application", "Name=Gatewright",
  "Comment=Gerencie projetos, execuções e integrações de agentes",
  `Exec=${quote(process.execPath)} ${quote(entry)} desktop`,
  "Icon=io.gatewright.Desktop", "StartupWMClass=io.gatewright.Desktop", "Terminal=false", "Categories=Development;", "",
].join("\n"));
process.stdout.write(path + "\n");
