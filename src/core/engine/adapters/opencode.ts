import { createStreamHost } from "./stream-host.js";
import type { CommandProbe } from "../../env/probes.js";

export const createOpenCodeAdapter = (probe?: CommandProbe) => createStreamHost("opencode", probe);
export const openCodeAdapter = createOpenCodeAdapter();
