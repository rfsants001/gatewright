import { createStreamHost } from "./stream-host.js";
import type { CommandProbe } from "../../env/probes.js";

export const createGeminiAdapter = (probe?: CommandProbe) => createStreamHost("gemini", probe);
export const geminiAdapter = createGeminiAdapter();
