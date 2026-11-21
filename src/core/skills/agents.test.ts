import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentSchema,
  composeAgent,
  deleteAgent,
  projectAgents,
  saveAgent,
  updateAgent,
  type AgentProfile,
} from "./agents.js";
import { FileArtifactStore } from "../artifact-store/artifact-store.js";
import { ConfigStore } from "../config/config-store.js";

// A bundled skill guaranteed to exist in the repo.
const SKILL = "gate-code-review";

const baseProfile: AgentProfile = {
  id: "reviewer",
  name: "Reviewer",
  goal: "Review pull requests.",
  skills: [SKILL],
};

const fullProfile: AgentProfile = {
  ...baseProfile,
  id: "reviewer-full",
  responsibilities: "Examine diffs for correctness.",
  expectedInput: "A pull request URL.",
  expectedOutput: "Markdown review comment.",
  boundaries: "No test generation.",
  schemaVersion: 2,
};

describe("agents", () => {
  let gate: string;
  let proj: string;

  beforeEach(() => {
    gate = mkdtempSync(join(tmpdir(), "gw-gate-"));
    proj = mkdtempSync(join(tmpdir(), "gw-proj-"));
    process.env.GATEWRIGHT_HOME = gate;
  });

  afterEach(() => {
    delete process.env.GATEWRIGHT_HOME;
    rmSync(gate, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  });

  // helpers scoped to the current proj
  const agents = () => projectAgents(proj);
  const store = () => new ConfigStore(new FileArtifactStore());

  describe("agentSchema", () => {
    it("parses a legacy profile (only id/name/goal/skills)", () => {
      const result = agentSchema.safeParse(baseProfile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.responsibilities).toBeUndefined();
        expect(result.data.expectedInput).toBeUndefined();
        expect(result.data.expectedOutput).toBeUndefined();
        expect(result.data.boundaries).toBeUndefined();
        expect(result.data.schemaVersion).toBeUndefined();
      }
    });

    it("parses a full v2 profile", () => {
      const result = agentSchema.safeParse(fullProfile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.responsibilities).toBe("Examine diffs for correctness.");
        expect(result.data.schemaVersion).toBe(2);
      }
    });

    it("rejects unknown extra keys (strict)", () => {
      const result = agentSchema.safeParse({ ...baseProfile, extra: "nope" });
      expect(result.success).toBe(false);
    });

    it("rejects schemaVersion other than 2", () => {
      const result = agentSchema.safeParse({ ...baseProfile, schemaVersion: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe("projectAgents", () => {
    it("returns empty array when no agents stored", () => {
      expect(agents()).toEqual([]);
    });

    it("drops invalid entries silently via safeParse", () => {
      store().write("project", { agents: [{ id: "bad" } as AgentProfile, baseProfile] }, proj);
      expect(agents()).toHaveLength(1);
      expect(agents()[0]?.id).toBe("reviewer");
    });
  });

  describe("composeAgent", () => {
    it("produces header + skills section for a legacy profile", () => {
      const text = composeAgent(proj, baseProfile);
      expect(text).toContain("Perfil: Reviewer");
      expect(text).toContain("Objetivo: Review pull requests.");
      expect(text).toContain(`## ${SKILL}`);
      // no optional headings
      expect(text).not.toContain("## Responsabilidades");
      expect(text).not.toContain("## Entrada esperada");
      expect(text).not.toContain("## Saída esperada");
      expect(text).not.toContain("## Limites");
    });

    it("inserts optional headings before skills section, in order", () => {
      const text = composeAgent(proj, fullProfile);
      const posResp = text.indexOf("## Responsabilidades");
      const posIn = text.indexOf("## Entrada esperada");
      const posOut = text.indexOf("## Saída esperada");
      const posLim = text.indexOf("## Limites");
      const posSkill = text.indexOf(`## ${SKILL}`);
      expect(posResp).toBeGreaterThan(-1);
      expect(posIn).toBeGreaterThan(posResp);
      expect(posOut).toBeGreaterThan(posIn);
      expect(posLim).toBeGreaterThan(posOut);
      expect(posSkill).toBeGreaterThan(posLim);
    });

    it("omits a heading when its field is absent", () => {
      const partial: AgentProfile = { ...baseProfile, responsibilities: "Only this." };
      const text = composeAgent(proj, partial);
      expect(text).toContain("## Responsabilidades");
      expect(text).not.toContain("## Entrada esperada");
      expect(text).not.toContain("## Saída esperada");
      expect(text).not.toContain("## Limites");
    });

    it("throws on unknown skill", () => {
      const bad: AgentProfile = { ...baseProfile, skills: ["not-a-real-skill"] };
      expect(() => composeAgent(proj, bad)).toThrow(/não está disponível/);
    });

    it("throws when composed text exceeds 20 KB", () => {
      // pad the goal to push the total over the limit
      const big: AgentProfile = { ...baseProfile, goal: "x".repeat(20_000) };
      expect(() => composeAgent(proj, big)).toThrow(/20 KB/);
    });
  });

  describe("saveAgent", () => {
    it("creates an agent and rejects duplicate id", () => {
      saveAgent(proj, baseProfile);
      expect(agents()).toHaveLength(1);
      expect(() => saveAgent(proj, baseProfile)).toThrow(/Já existe/);
    });
  });

  describe("updateAgent", () => {
    it("throws when id does not exist", () => {
      expect(() => updateAgent(proj, baseProfile)).toThrow(/Agente não encontrado/);
    });

    it("replaces the entry in place, preserving array order", () => {
      const second: AgentProfile = { ...baseProfile, id: "second", name: "Second" };
      const third: AgentProfile = { ...baseProfile, id: "third", name: "Third" };
      saveAgent(proj, baseProfile);
      saveAgent(proj, second);
      saveAgent(proj, third);

      const updated: AgentProfile = { ...baseProfile, name: "Reviewer Updated", schemaVersion: 2 };
      updateAgent(proj, updated);

      const result = agents();
      expect(result).toHaveLength(3);
      expect(result[0]?.id).toBe("reviewer");
      expect(result[0]?.name).toBe("Reviewer Updated");
      expect(result[0]?.schemaVersion).toBe(2);
      expect(result[1]?.id).toBe("second");
      expect(result[2]?.id).toBe("third");
    });

    it("does not create a duplicate when updating", () => {
      saveAgent(proj, baseProfile);
      updateAgent(proj, { ...baseProfile, name: "Changed" });
      expect(agents()).toHaveLength(1);
    });

    it("persists new optional fields after update", () => {
      saveAgent(proj, baseProfile);
      updateAgent(proj, { ...baseProfile, responsibilities: "New resp.", schemaVersion: 2 });
      const result = agents();
      expect(result[0]?.responsibilities).toBe("New resp.");
    });

    it("legacy profile round-trips through update", () => {
      saveAgent(proj, baseProfile);
      updateAgent(proj, baseProfile);
      const result = agents();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(baseProfile);
    });

    it("rejects an update with an unknown skill", () => {
      saveAgent(proj, baseProfile);
      const bad: AgentProfile = { ...baseProfile, skills: ["ghost-skill"] };
      expect(() => updateAgent(proj, bad)).toThrow(/não está disponível/);
    });
  });

  describe("deleteAgent", () => {
    it("removes the agent by id", () => {
      saveAgent(proj, baseProfile);
      deleteAgent(proj, "reviewer");
      expect(agents()).toHaveLength(0);
    });

    it("is no-op when id is absent", () => {
      saveAgent(proj, baseProfile);
      deleteAgent(proj, "nonexistent");
      expect(agents()).toHaveLength(1);
    });

    it("only removes the target, preserving others", () => {
      const second: AgentProfile = { ...baseProfile, id: "second", name: "Second" };
      saveAgent(proj, baseProfile);
      saveAgent(proj, second);
      deleteAgent(proj, "reviewer");
      const result = agents();
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("second");
    });
  });
});
