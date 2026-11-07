import { describe, expect, it } from "vitest";
import { excerpt, mailtoHref, normalizeTags, noteTitle, parseQuery, plainText } from "./notes";

describe("notes", () => {
  it("normalizes tags", () => {
    expect(normalizeTags("#Work, ideas  #work church")).toEqual(["work", "ideas", "church"]);
    expect(normalizeTags(["Reunião!", "", "#a/b"])).toEqual(["reunião", "a/b"]);
  });
  it("turns Markdown into plain text", () => {
    expect(plainText("# Plan\n\n**Bold** and _it_ with [link](https://x.co)\n- [x] done\n- [ ] todo\n- item\n> quote\n`code`")).toBe(
      "Plan\n\nBold and it with link (https://x.co)\n☑ done\n☐ todo\n• item\nquote\ncode",
    );
  });
  it("uses the first line as title when there is none", () => {
    expect(noteTitle({ title: "", body: "## Groceries\n- milk" })).toBe("Groceries");
    expect(noteTitle({ title: " Sermon ", body: "x" })).toBe("Sermon");
    expect(noteTitle({ title: "", body: "  " })).toBe("Untitled note");
    expect(excerpt({ title: "", body: "## Groceries\n- milk\n- eggs" })).toBe("• milk • eggs");
    expect(excerpt({ title: "T", body: "a ".repeat(100) }, 10)).toBe("a a a a a…");
  });
  it("parses the search box", () => {
    expect(parseQuery("  #Work budget  2027 ")).toEqual({ words: ["budget", "2027"], tags: ["work"] });
    expect(parseQuery("#")).toEqual({ words: ["#"], tags: [] });
  });
  it("builds the e-mail link", () => {
    const href = mailtoHref({ title: "", body: "# Idea\nCall **Ana** & co", tags: ["work"] });
    expect(href.startsWith("mailto:?subject=Idea&body=")).toBe(true);
    expect(decodeURIComponent(href.split("body=")[1])).toBe("Idea\nCall Ana & co\n\n#work");
    expect(href).not.toContain("+");
  });
});

import { noteEvent, parseHm } from "./notes";
import { zonedToUtc } from "./dates";

describe("note → calendar event", () => {
  it("parses times", () => {
    expect(parseHm("09:30")).toBe(570);
    expect(parseHm("24:00")).toBeNull();
    expect(parseHm("")).toBeNull();
  });
  it("makes a timed event in the app time zone", () => {
    const e = noteEvent({ id: "n1", title: "", body: "# Call Ana\nAbout the budget" }, { date: "2026-11-10", time: "14:00", durationMin: 45, tz: "America/New_York" }, zonedToUtc, "https://app.dev/");
    expect(e.title).toBe("Call Ana");
    expect(e.start.toISOString()).toBe("2026-11-10T19:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-11-10T19:45:00.000Z");
    expect(e.google.start).toEqual({ dateTime: "2026-11-10T19:00:00.000Z", timeZone: "America/New_York" });
    expect(e.description).toBe("Call Ana\nAbout the budget\n\nhttps://app.dev/notes?n=n1");
  });
  it("makes an all-day event", () => {
    const e = noteEvent({ id: "n1", title: "Retreat", body: "" }, { date: "2026-12-31", time: null, durationMin: 60, tz: "America/New_York" }, zonedToUtc);
    expect(e.allDay).toBe(true);
    expect(e.google).toMatchObject({ start: { date: "2026-12-31" }, end: { date: "2027-01-01" } });
    expect(e.start.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("tables in plain text", () => {
  it("flattens Markdown tables", () => {
    expect(plainText("| Area | Owner |\n|---|:--:|\n| Data | Lud |")).toBe("Area · Owner\nData · Lud");
  });
});
