import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { PermissionRow, permissionSummary } from "./permission-row.js";

describe("permissionSummary", () => {
  it("joins tool and target, tolerating a missing target", () => {
    expect(permissionSummary({ tool: "Write", target: ".env.production" })).toBe("Write .env.production");
    expect(permissionSummary({ tool: "shell" })).toBe("shell");
  });
});

describe("<PermissionRow>", () => {
  it("renders the request and the allow/deny/session options", () => {
    const { lastFrame } = render(<PermissionRow action={{ tool: "Write", target: ".env.production" }} />);
    const frame = lastFrame()!;
    expect(frame).toContain("⚠ Approval required: Write .env.production");
    expect(frame).toContain("[a] allow");
    expect(frame).toContain("[d] deny");
    expect(frame).toContain("[s] allow-session");
  });
});
