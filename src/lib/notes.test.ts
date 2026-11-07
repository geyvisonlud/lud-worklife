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
