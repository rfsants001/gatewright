import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { SkillsScreen } from "./skills-screen.js";
import type { Skill } from "../core/skills/types.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

const skills: Skill[] = [
  { frontmatter: { name: "gate-code-review", description: "review a diff", triggers: [], skillKind: "quality", metadata: {} }, body: "" },
  { frontmatter: { name: "gate-adr-writer", description: "record a decision", triggers: [], skillKind: "architecture", metadata: {} }, body: "" },
];

describe("SkillsScreen", () => {
  it("lists the gate's skills grouped by category", () => {
    const out = render(<SkillsScreen onBack={noop} onQuit={noop} skills={skills} />).lastFrame() ?? "";
    expect(out).toContain("the gate's, not the AI's");
    expect(out).toContain("quality");
    expect(out).toContain("architecture");
    expect(out).toContain("gate-code-review");
    expect(out).toContain("gate-adr-writer");
  });

  it("goes back on 'b'", async () => {
    const onBack = vi.fn();
    const { stdin } = render(<SkillsScreen onBack={onBack} onQuit={noop} skills={skills} />);
    stdin.write("b");
    await delay(20);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
