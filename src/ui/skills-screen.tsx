// SkillsScreen — the GATE's curated skills (not the host AI's). A paginated list
// with a category filter (←/→) and inline detail (enter). The gate is the
// orchestrator, so these are the skills a driven run gets.

import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, ScrollableList, Badge, Icon, TabBar, HINTS_BACK, HINTS_QUIT } from "./components/index.js";
import { loadGateSkills } from "../core/skills/gate-catalog.js";
import type { Skill } from "../core/skills/types.js";
import { categoryColor } from "./theme.js";

export function SkillsScreen({ onBack, onQuit, skills }: { onBack: () => void; onQuit: () => void; skills?: Skill[] }) {
  const list = skills ?? loadGateSkills().list();
  const categories = useMemo(
    () => ["all", ...[...new Set(list.map((s) => s.frontmatter.skillKind))].sort()],
    [list],
  );
  const [catIndex, setCatIndex] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const activeCat = categories[catIndex]!;
  const filtered = activeCat === "all" ? list : list.filter((s) => s.frontmatter.skillKind === activeCat);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape) onBack();
    else if (key.leftArrow) setCatIndex((i) => (i - 1 + categories.length) % categories.length);
    else if (key.rightArrow) setCatIndex((i) => (i + 1) % categories.length);
  });

  return (
    <AppFrame
      breadcrumb={`skills · ${list.length}`}
      hints={[{ key: "↑↓", label: "move" }, { key: "←→", label: "category" }, { key: "enter", label: "detail" }, HINTS_BACK[0]!, ...HINTS_QUIT]}
    >
      <Text dimColor>These ship with Gatewright and are handed to the engine it runs.</Text>
      <Box marginY={1}>
        <TabBar tabs={categories.map((c) => ({ id: c, label: c }))} active={activeCat} onSwitch={() => {}} isActive={false} />
      </Box>
      <ScrollableList
        items={filtered}
        onSelect={(s) => setExpanded((e) => (e === s.frontmatter.name ? null : s.frontmatter.name))}
        renderItem={(s, active) => (
          <Box flexDirection="column">
            <Text>
              <Text {...(active ? { color: "cyan" } : {})}>{active ? "> " : "  "}</Text>
              <Icon name="skill" color={categoryColor(s.frontmatter.skillKind)} />
              <Text bold>{` ${s.frontmatter.name}  `}</Text>
              <Badge label={s.frontmatter.skillKind} color={categoryColor(s.frontmatter.skillKind)} dim={!active} />
              <Text dimColor>{`  ${s.frontmatter.description}`}</Text>
            </Text>
            {expanded === s.frontmatter.name
              ? (s.body ?? "").split("\n").slice(0, 12).map((l, i) => <Text key={i} dimColor>{`      ${l}`}</Text>)
              : null}
          </Box>
        )}
      />
    </AppFrame>
  );
}
