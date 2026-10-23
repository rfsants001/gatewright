import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AppFrame, ScrollableList, TabBar, Badge } from "./components/index.js";
import { HINTS_BACK, HINTS_QUIT, HINTS_NAV } from "./components/index.js";
import { loadGateSkills } from "../core/skills/gate-catalog.js";
import { categoryColor } from "./theme.js";
import type { Skill } from "../core/skills/types.js";

const ALL = "all";

export function SkillsScreen({ onBack, onQuit, skills }: { onBack: () => void; onQuit: () => void; skills?: Skill[] }) {
  const list = skills ?? loadGateSkills().list();
  const cats = [ALL, ...Array.from(new Set(list.map((s) => s.frontmatter.skillKind))).sort()];
  const [cat, setCat] = useState(ALL);
  const [expanded, setExpanded] = useState<string | null>(null);
  const filtered = cat === ALL ? list : list.filter((s) => s.frontmatter.skillKind === cat);

  useInput((input, key) => {
    if (input === "q") onQuit();
    else if (input === "b" || key.escape || key.leftArrow) onBack();
  });

  const tabs: import("./components/tab-bar.js").Tab[] = cats.map((c) => ({
    id: c,
    label: c === ALL ? `all (${list.length})` : c,
    ...(c !== ALL ? { badge: String(list.filter((s) => s.frontmatter.skillKind === c).length) } : {}),
  }));

  return (
    <AppFrame
      breadcrumb="skills"
      hints={[...HINTS_NAV, { key: "enter", label: "expand" }, ...HINTS_BACK, ...HINTS_QUIT]}
    >
      <Text dimColor>The gate's curated skills — handed to the engine on each run.</Text>
      <TabBar tabs={tabs} active={cat} onSwitch={setCat} />
      <Box marginTop={1}>
        <ScrollableList
          items={filtered}
          onSelect={(s) => setExpanded((e) => (e === s.frontmatter.name ? null : s.frontmatter.name))}
          renderItem={(s, active) => {
            const isExpanded = expanded === s.frontmatter.name;
            const color = categoryColor(s.frontmatter.skillKind);
            return (
              <Box flexDirection="column">
                <Box gap={1}>
                  <Text {...(active ? { color: "cyan" as const } : {})}>{active ? "▶" : " "}</Text>
                  <Text {...(active ? { color: "cyan" as const } : {})} bold={active}>{s.frontmatter.name}</Text>
                  <Badge label={s.frontmatter.skillKind} color={color} dim={!active} />
                  {!isExpanded && <Text dimColor>{s.frontmatter.description}</Text>}
                </Box>
                {isExpanded && (
                  <Box flexDirection="column" paddingLeft={2}>
                    <Text>{s.frontmatter.description}</Text>
                    <Text dimColor>{s.body.slice(0, 400)}{s.body.length > 400 ? "…" : ""}</Text>
                  </Box>
                )}
              </Box>
            );
          }}
        />
      </Box>
    </AppFrame>
  );
}
