// SkillsScreen — lists the GATE's curated skills (not the host AI's), grouped by
// category. The gate is the orchestrator, so these are the skills a driven run gets.

import { Box, Text, useInput } from "ink";
import { Logo, Panel, Card } from "./components/index.js";
import { loadGateSkills } from "../core/skills/gate-catalog.js";
import type { Skill } from "../core/skills/types.js";

const CAT_COLOR: Record<string, string> = {
  architecture: "blue",
  development: "green",
  quality: "magenta",
  workflows: "cyan",
  sdd: "yellow",
};

export function SkillsScreen({ onBack, onQuit, skills }: { onBack: () => void; onQuit: () => void; skills?: Skill[] }) {
  const list = skills ?? loadGateSkills().list();
  const byCat: Record<string, Skill[]> = {};
  for (const s of list) (byCat[s.frontmatter.skillKind] ??= []).push(s);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape || key.leftArrow) onBack();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Logo />
      <Panel title={`Gate skills  ·  ${list.length} curated (the gate's, not the AI's)`} color="cyan">
        <Text dimColor>These ship with Gatewright and are handed to the engine it runs.</Text>
        {Object.keys(byCat).sort().map((cat) => (
          <Box key={cat} flexDirection="column" marginTop={1}>
            <Text bold color={CAT_COLOR[cat] ?? "white"}>{cat}</Text>
            <Box flexWrap="wrap">
              {byCat[cat]!.map((s) => (
                <Box key={s.frontmatter.name} width="50%" paddingRight={1}>
                  <Card title={s.frontmatter.name} color={CAT_COLOR[cat] ?? "white"} description={s.frontmatter.description} />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
        <Text dimColor>  b back · q quit</Text>
      </Panel>
    </Box>
  );
}
