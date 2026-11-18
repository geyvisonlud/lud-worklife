import { describe, expect, it } from "vitest";
import {
  assignedVia,
  blocksMention,
  pageDue,
  pageStatus,
  pageTitle,
  propertiesMention,
  simplifyBlocks,
  stageFromStatus,
  summary,
  todosForUser,
  type NotionBlock,
  type RichText,
} from "./notion";

const ME = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";
const text = (t: string, extra: Partial<RichText> = {}): RichText => ({ type: "text", plain_text: t, ...extra });
const at = (id: string, name = "Geyvison"): RichText => ({ type: "mention", plain_text: `@${name}`, mention: { type: "user", user: { id } } });
const block = (type: string, rich: RichText[], extra: Record<string, unknown> = {}, children?: NotionBlock[]): NotionBlock => ({
  id: `${type}-${Math.random()}`,
  type,
  [type]: { rich_text: rich, ...extra },
  ...(children ? { children, has_children: true } : {}),
});

const page = {
  properties: {
    Name: { type: "title", title: [text("Q1 launch plan")] },
    Owner: { type: "people", people: [{ id: OTHER }] },
    Team: { type: "people", people: [{ id: ME.replace(/-/g, "") }] },
    Status: { type: "status", status: { name: "In progress" } },
    Deadline: { type: "date", date: { start: "2027-01-31" } },
    Notes: { type: "rich_text", rich_text: [text("ask "), at(ME)] },
  },
};

describe("Notion detection", () => {
  it("finds me in a People property (ids with or without dashes)", () => {
    expect(assignedVia(page.properties, ME)).toBe("Team");
    expect(assignedVia({ Owner: { type: "people", people: [{ id: OTHER }] } }, ME)).toBeNull();
  });
  it("finds @mentions in properties and nested blocks", () => {
    expect(propertiesMention(page.properties, ME)).toBe(true);
    const blocks = [block("paragraph", [text("Hello")]), block("toggle", [text("Details")], {}, [block("bulleted_list_item", [text("ping "), at(ME)])])];
    expect(blocksMention(blocks, ME)).toBe(true);
    expect(blocksMention(blocks, OTHER)).toBe(false);
  });
  it("turns to-dos that mention me into tasks, without the mention", () => {
    const blocks = [
      block("to_do", [at(ME), text(" review the deck")], { checked: false }),
      block("to_do", [text("Send invoice — "), at(ME)], { checked: true }),
      block("to_do", [at(OTHER, "Ana"), text(" book the venue")], { checked: false }),
    ];
    expect(todosForUser(blocks, ME).map((t) => [t.title, t.checked])).toEqual([
      ["review the deck", false],
      ["Send invoice", true],
    ]);
  });
});

describe("Notion page fields", () => {
  it("reads title, status and due date", () => {
    expect(pageTitle(page)).toBe("Q1 launch plan");
    expect(pageStatus(page)).toBe("In progress");
    expect(pageDue(page)).toBe("2027-01-31");
    expect(pageStatus({ properties: { Stage: { type: "select", select: { name: "Done" } } } })).toBe("Done");
    expect(pageTitle({ properties: {} })).toBe("Untitled");
  });
  it("maps statuses (English and Portuguese) to stages", () => {
    expect(stageFromStatus("Not started")).toBe("planned");
    expect(stageFromStatus("Backlog")).toBe("planned");
    expect(stageFromStatus("In progress")).toBe("active");
    expect(stageFromStatus("Em andamento")).toBe("active");
    expect(stageFromStatus("Em revisão")).toBe("active");
    expect(stageFromStatus("Blocked")).toBe("hold");
    expect(stageFromStatus("Pausado")).toBe("hold");
    expect(stageFromStatus("Done ✅")).toBe("done");
    expect(stageFromStatus("Concluído")).toBe("done");
    expect(stageFromStatus(null)).toBeNull();
  });
});

describe("content snapshot", () => {
  it("simplifies blocks, flattens columns and marks my mentions", () => {
    const blocks: NotionBlock[] = [
      block("heading_2", [text("Goals")]),
      { id: "cl", type: "column_list", has_children: true, children: [{ id: "c1", type: "column", children: [block("paragraph", [text("Left "), text("bold", { annotations: { bold: true } })])] }] },
      block("to_do", [at(ME), text(" ship it")], { checked: true }),
      { id: "d", type: "divider", divider: {} },
      { id: "img", type: "image", image: { caption: [] } },
      { id: "sp", type: "child_page", child_page: { title: "Specs" } },
      { id: "x", type: "unsupported" },
    ];
    const s = simplifyBlocks(blocks, ME);
    expect(s.map((b) => b.type)).toEqual(["h2", "p", "todo", "divider", "media", "child"]);
    expect(s[1].text[1]).toEqual({ t: "bold", b: 1 });
    expect(s[2].checked).toBe(true);
    expect(s[2].text[0]).toMatchObject({ m: "user", me: 1 });
    expect(s[5].text[0].t).toBe("Specs");
  });
  it("summarizes paragraphs", () => {
    const s = simplifyBlocks([block("heading_1", [text("Title")]), block("paragraph", [text("First.")]), block("paragraph", [text("Second.")])], ME);
    expect(summary(s)).toBe("First. Second.");
    expect(summary([])).toBeNull();
  });
});
