// Hardware probe — total/free RAM, CPU and a best-effort GPU read. Used to rank which
// local models the machine can comfortably run (canirun.ai-style). GPU detection is
// best-effort across vendors; RAM is what matters most for Ollama (CPU inference).

import { cpus, freemem, totalmem } from "node:os";
import type { CommandProbe } from "./probes.js";
import { defaultCommandProbe } from "./probes.js";

export interface Gpu {
  name: string;
  vramGB?: number;
}

export interface Hardware {
  totalRamGB: number;
  freeRamGB: number;
  cpuModel: string;
  cpuCount: number;
  gpu?: Gpu;
}

const gb = (bytes: number): number => Math.round((bytes / 1024 ** 3) * 10) / 10;

function detectGpu(probe: CommandProbe): Gpu | undefined {
  // NVIDIA: exact name + VRAM.
  const nv = probe("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  if (nv) {
    const [name, mib] = nv.split("\n")[0]!.split(",").map((s) => s.trim());
    if (name) return mib && Number.isFinite(Number(mib)) ? { name, vramGB: Math.round((Number(mib) / 1024) * 10) / 10 } : { name };
  }
  // macOS: chipset name (+ VRAM when present).
  const mac = probe("system_profiler", ["SPDisplaysDataType"]);
  if (mac) {
    const name = mac.match(/Chipset Model:\s*(.+)/)?.[1]?.trim();
    const vram = mac.match(/VRAM.*?:\s*(\d+)\s*GB/)?.[1];
    if (name) return vram ? { name, vramGB: Number(vram) } : { name };
  }
  // Linux generic: a VGA controller name via lspci (no reliable VRAM).
  const lspci = probe("sh", ["-c", "lspci | grep -i 'vga\\|3d controller'"]);
  const line = lspci?.split("\n")[0]?.split(": ")[1]?.trim();
  if (line) return { name: line };
  return undefined;
}

export function detectHardware(opts: { commandProbe?: CommandProbe } = {}): Hardware {
  const probe = opts.commandProbe ?? defaultCommandProbe;
  const cpuList = cpus();
  const gpu = detectGpu(probe);
  return {
    totalRamGB: gb(totalmem()),
    freeRamGB: gb(freemem()),
    cpuModel: cpuList[0]?.model?.trim() ?? "unknown",
    cpuCount: cpuList.length,
    ...(gpu ? { gpu } : {}),
  };
}
