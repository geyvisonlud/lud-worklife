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

import { cardDescription, checklist, columnLabel, isColumnOf, mergeColumns, newColumnKey } from "./kanban";

describe("board columns", () => {
  it("merges built-in columns with the user's changes and custom ones", () => {
    const cols = mergeColumns("tasks", [
      { key: "backlog", label: "Ideas", color: "violet", position: 5000, hidden: false },
      { key: "c_review01", label: "In review", color: "violet", position: 3500, hidden: false },
      { key: "done", label: "Done", color: "green", position: 4096, hidden: true },
    ]);
    expect(cols.map((c) => c.key)).toEqual(["todo", "doing", "c_review01", "done", "backlog"]);
    expect(cols.find((c) => c.key === "backlog")?.label).toBe("Ideas");
    expect(cols.find((c) => c.key === "done")?.hidden).toBe(false); // done can't be hidden
    expect(cols.find((c) => c.key === "c_review01")?.builtIn).toBe(false);
  });
  it("validates columns and labels them", () => {
    expect(isColumnOf("tasks", "doing")).toBe(true);
    expect(isColumnOf("tasks", "hold")).toBe(false);
    expect(isColumnOf("projects", "hold")).toBe(true);
    expect(isColumnOf("tasks", "c_abcd1234", ["c_abcd1234"])).toBe(true);
    expect(isColumnOf("tasks", "c_abcd1234")).toBe(false);
    expect(newColumnKey(() => 0.5)).toMatch(/^c_[a-z0-9]{8}$/);
    expect(columnLabel([{ key: "c_x1234", label: "Blocked" }], "c_x1234")).toBe("Blocked");
    expect(columnLabel([], "doing")).toBe("In progress");
    expect(columnLabel([], "hold")).toBe("On hold");
  });
  it("reads checklists and descriptions from notes", () => {
    const n = "Ship it to the client.\n- [x] draft\n- [ ] review\n* [X] send";
    expect(checklist(n)).toEqual({ total: 3, done: 2 });
    expect(checklist(null)).toEqual({ total: 0, done: 0 });
    expect(cardDescription(n)).toBe("Ship it to the client.");
    expect(cardDescription("- [ ] only")).toBeNull();
  });
});
