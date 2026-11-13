import { createStreamHost } from "./stream-host.js";
import type { CommandProbe } from "../../env/probes.js";

export const createCodexAdapter = (probe?: CommandProbe) => createStreamHost("codex", probe);
export const codexAdapter = createCodexAdapter();
