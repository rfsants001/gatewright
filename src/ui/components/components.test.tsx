import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { Panel } from "./panel.js";
import { Icon, ICONS } from "./icon.js";
import { ProgressBar } from "./progress-bar.js";
import { RadioGroup } from "./radio-group.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DOWN = "[B";

describe("UI components render", () => {
  it("Panel draws a rounded border with a title and children", () => {
    const { lastFrame } = render(
      <Panel title="Status">
        <Text>hello</Text>
      </Panel>,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Status");
    expect(out).toContain("hello");
    expect(out).toMatch(/[╭╮╰╯]/); // rounded border corners
  });

  it("Icon renders a non-empty portable symbol for every name", () => {
    for (const name of Object.keys(ICONS) as (keyof typeof ICONS)[]) {
      const { lastFrame } = render(<Icon name={name} />);
      expect((lastFrame() ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("ProgressBar shows filled, empty and a percentage", () => {
    const { lastFrame } = render(<ProgressBar value={0.5} width={10} label="Setup" />);
    const out = lastFrame() ?? "";
    expect(out).toContain("Setup");
    expect(out).toContain("50%");
    expect(out).toContain("█");
    expect(out).toContain("░");
  });

  it("ProgressBar clamps out-of-range values", () => {
    expect(render(<ProgressBar value={2} width={4} />).lastFrame() ?? "").toContain("100%");
    expect(render(<ProgressBar value={-1} width={4} />).lastFrame() ?? "").toContain("0%");
  });

  it("RadioGroup moves the selection on the down arrow (useInput wiring)", async () => {
    function Harness() {
      const [value, setValue] = useState("a");
      return (
        <RadioGroup
          value={value}
          onChange={setValue}
          options={[
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ]}
        />
      );
    }
    const { lastFrame, stdin } = render(<Harness />);
    expect(lastFrame()).toContain(`${ICONS.radioOn} Alpha`);
    stdin.write(DOWN);
    await delay(20);
    expect(lastFrame()).toContain(`${ICONS.radioOn} Beta`);
  });
});
