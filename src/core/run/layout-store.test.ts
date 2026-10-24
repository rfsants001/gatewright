import { describe, it, expect } from "vitest";
import { effectiveSidebarWidth, isSidebarOverlay } from "./layout-store.js";

describe("effectiveSidebarWidth", () => {
  it("returns 0 when sidebar closed", () => {
    expect(effectiveSidebarWidth(120, { sidebarWidth: 40, sidebarOpen: false })).toBe(0);
  });
  it("returns 0 when terminal too narrow", () => {
    expect(effectiveSidebarWidth(80, { sidebarWidth: 40, sidebarOpen: true })).toBe(0);
  });
  it("returns configured width when open and wide", () => {
    expect(effectiveSidebarWidth(120, { sidebarWidth: 40, sidebarOpen: true })).toBe(40);
  });
  it("caps sidebar at 1/3 terminal width", () => {
    expect(effectiveSidebarWidth(100, { sidebarWidth: 60, sidebarOpen: true })).toBe(33);
  });
});

describe("isSidebarOverlay", () => {
  it("overlay when narrow", () => {
    expect(isSidebarOverlay(80)).toBe(true);
  });
  it("not overlay when wide", () => {
    expect(isSidebarOverlay(100)).toBe(false);
  });
});
