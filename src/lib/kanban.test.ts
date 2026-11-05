import { describe, expect, it } from "vitest";
import { positionAt, positionBetween, progress, stageLabel } from "./kanban";

describe("kanban ordering", () => {
  it("positions between neighbours", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(null, 10)).toBe(-1014);
    expect(positionBetween(10, null)).toBe(1034);
    expect(positionBetween(10, 20)).toBe(15);
  });
  it("positions at an index", () => {
    const col = [{ position: 1 }, { position: 2 }, { position: 4 }];
    expect(positionAt(col, 0)).toBeLessThan(1);
    expect(positionAt(col, 2)).toBe(3);
    expect(positionAt(col, 3)).toBeGreaterThan(4);
    expect(positionAt(col, 99)).toBeGreaterThan(4);
    expect(positionAt([], 0)).toBe(1024);
  });
  it("progress", () => {
    expect(progress([{ status: "done" }, { status: "todo" }])).toEqual({ total: 2, done: 1, pct: 0.5 });
    expect(progress([]).pct).toBe(0);
  });
  it("labels", () => {
    expect(stageLabel("hold")).toBe("On hold");
  });
});
