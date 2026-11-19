import { describe, expect, it } from "vitest";
import { kindFrom, parseInboxRow, priorityFrom, sameProjectName } from "./notion-inbox";

const rt = (t: string) => [{ type: "text", plain_text: t }];
const row = (props: Record<string, unknown>) => ({ properties: props as never });

describe("Dashboard Inbox rows", () => {
  it("reads a task with every property", () => {
    expect(
      parseInboxRow(
        row({
          Name: { type: "title", title: rt("Send the budget") },
          Type: { type: "select", select: { name: "Task" } },
          Project: { type: "rich_text", rich_text: rt("Website") },
          Due: { type: "date", date: { start: "2026-11-21" } },
          Priority: { type: "select", select: { name: "High" } },
          Notes: { type: "rich_text", rich_text: rt("Ask Ana first") },
        }),
      ),
    ).toEqual({ kind: "task", title: "Send the budget", project: "Website", dueDate: "2026-11-21", priority: 3, notes: "Ask Ana first" });
  });
  it("reads Portuguese names, a project, and defaults", () => {
    expect(
      parseInboxRow(
        row({
          Nome: { type: "title", title: rt("Cantata de Natal") },
          Tipo: { type: "select", select: { name: "Projeto" } },
          "Data de entrega": { type: "date", date: { start: "2026-12-01", end: "2026-12-20" } },
          Prioridade: { type: "select", select: { name: "Alta" } },
          Descrição: { type: "rich_text", rich_text: rt("Música e projeção") },
        }),
      ),
    ).toEqual({ kind: "project", title: "Cantata de Natal", project: null, dueDate: "2026-12-20", priority: 0, notes: "Música e projeção" });
    expect(parseInboxRow(row({ Name: { type: "title", title: rt("Just a title") } }))).toEqual({
      kind: "task",
      title: "Just a title",
      project: null,
      dueDate: null,
      priority: 0,
      notes: null,
    });
  });
  it("skips rows without a name yet", () => {
    expect(parseInboxRow(row({ Name: { type: "title", title: [] } }))).toBeNull();
  });
  it("maps types, priorities and project names", () => {
    expect(kindFrom("project")).toBe("project");
    expect(kindFrom("Tarefa")).toBe("task");
    expect(kindFrom(null)).toBe("task");
    expect(priorityFrom("Média")).toBe(2);
    expect(priorityFrom("baixa")).toBe(1);
    expect(priorityFrom("P1")).toBe(3);
    expect(priorityFrom("none")).toBe(0);
    expect(sameProjectName("Cantata  de natal", "cantata de Natal")).toBe(true);
    expect(sameProjectName("Página", "pagina")).toBe(true);
  });
});
