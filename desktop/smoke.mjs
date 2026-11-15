import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this check with npm run test:desktop.");

const fixture = await mkdtemp(join(tmpdir(), "gatewright-desktop-"));
const isWindows = process.platform === "win32";
let child;
let output = "";
try {
  const folder = join(fixture, "projeto de teste");
  await mkdir(folder);
  const project = await realpath(folder);
  const registry = join(fixture, "projects.json");
  child = spawn(process.execPath, [
    npm, "run", "desktop:dev", "--", project,
    `--user-data-dir=${join(fixture, "electron")}`,
    ...process.argv.slice(2),
  ], {
    detached: !isWindows,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GATEWRIGHT_HOME: fixture, GATEWRIGHT_PROJECTS: registry },
  });
  const collectOutput = (chunk) => { output = (output + chunk).slice(-32_768); };
  child.stdout.setEncoding("utf8").on("data", collectOutput);
  child.stderr.setEncoding("utf8").on("data", collectOutput);
  let launchError;
  child.on("error", (error) => { launchError = error; });

  // Registration requires the renderer to request the initial project over IPC.
  const deadline = Date.now() + 100_000;
  let opened = false;
  while (!opened && Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`The desktop exited before opening the project (${child.exitCode ?? child.signalCode}).`);
    }
    try {
      opened = JSON.parse(await readFile(registry, "utf8")).projects[project]?.path === project;
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    if (!opened) await delay(200);
  }

  if (!opened) throw new Error("The desktop did not open the supplied project within 100 seconds.");
  console.log(`Gatewright Desktop opened a project with spaces in its path on ${process.platform}.`);
} catch (error) {
  if (output) process.stderr.write(output);
  throw error;
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    if (isWindows) {
      execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
    await exited;
  }
  await rm(fixture, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
