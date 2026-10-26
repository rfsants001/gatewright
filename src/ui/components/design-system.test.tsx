import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { AppFrame } from "./app-frame.js";
import { KeyHints, HINTS_BACK, HINTS_QUIT } from "./key-hints.js";
import { Badge } from "./badge.js";
import { TabBar } from "./tab-bar.js";
import { ScrollableList, pageBounds } from "./scrollable-list.js";
import { SplitView } from "./split-view.js";
import { terminalMode } from "../hooks/use-terminal-size.js";
import { Text } from "ink";

describe("KeyHints", () => {
  it("joins hints with · separators", () => {
    const { lastFrame } = render(<KeyHints hints={[...HINTS_BACK.slice(0, 1), ...HINTS_QUIT]} />);
    expect(lastFrame()).toContain("b back · q quit");
  });
});

describe("AppFrame", () => {
  it("renders the compact header + breadcrumb + children + hints", () => {
    const { lastFrame } = render(
      <AppFrame breadcrumb="skills" hints={HINTS_QUIT}>
        <Text>body content</Text>
      </AppFrame>,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("gatewright");
    expect(frame).toContain("skills");
    expect(frame).toContain("body content");
    expect(frame).toContain("q quit");
  });

  it("logoMode shows the figlet wordmark region instead of the compact header", () => {
    const { lastFrame } = render(
      <AppFrame breadcrumb="home" hints={HINTS_QUIT} logoMode>
        <Text>home body</Text>
      </AppFrame>,
    );
    expect(lastFrame()).toContain("home body");
  });
});

describe("Badge", () => {
  it("renders a bracketed pill", () => {
    const { lastFrame } = render(<Badge label="PASSED" color="green" />);
    expect(lastFrame()).toContain("[PASSED]");
  });
});

describe("TabBar", () => {
  it("marks the active tab", () => {
    const { lastFrame } = render(
      <TabBar tabs={[{ id: "gate", label: "Gate" }, { id: "project", label: "Project" }]} active="project" onSwitch={() => {}} isActive={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("▶ Project ◀");
    expect(frame).toContain("Gate");
  });
});

describe("pageBounds", () => {
  it("computes the slice for the cursor's page", () => {
    expect(pageBounds(0, 34, 8)).toEqual({ start: 0, end: 8 });
    expect(pageBounds(10, 34, 8)).toEqual({ start: 8, end: 16 });
    expect(pageBounds(33, 34, 8)).toEqual({ start: 32, end: 34 });
    expect(pageBounds(0, 0, 8)).toEqual({ start: 0, end: 0 });
  });
});

describe("ScrollableList", () => {
  it("renders the first page and the position footer", () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const { lastFrame } = render(
      <ScrollableList items={items} pageSize={5} isActive={false} renderItem={(it, active) => <Text>{active ? `> ${it}` : it}</Text>} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("item-0");
    expect(frame).toContain("[1-5/20]  n/p page");
  });
});

describe("SplitView", () => {
  it("stacks in compact mode and splits otherwise", () => {
    const left = <Text>LEFT</Text>;
    const right = <Text>RIGHT</Text>;
    expect(render(<SplitView left={left} right={right} mode="compact" />).lastFrame()).toContain("LEFT");
    expect(render(<SplitView left={left} right={right} mode="normal" />).lastFrame()).toContain("RIGHT");
  });
});

describe("terminalMode", () => {
  it("classifies widths", () => {
    expect(terminalMode(50)).toBe("compact");
    expect(terminalMode(80)).toBe("normal");
    expect(terminalMode(130)).toBe("wide");
  });
});
