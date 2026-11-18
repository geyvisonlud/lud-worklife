import { describe, expect, it } from "vitest";
import { extractLinks, fallbackTitle, normalizeUrl, parseMeta, sourceOf, splitShared, toDate } from "./read-later";

describe("read later", () => {
  it("normalizes links", () => {
    expect(normalizeUrl("https://www.Example.com/a/?utm_source=x&id=2#top")).toBe("https://www.example.com/a/?id=2");
    expect(normalizeUrl("https://twitter.com/naval/status/1?s=20&t=abc")).toBe("https://x.com/naval/status/1");
    expect(normalizeUrl("https://www.instagram.com/p/C1abc/?igsh=xyz")).toBe("https://instagram.com/p/C1abc");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
  it("knows the source", () => {
    expect(sourceOf("https://instagram.com/p/1")).toBe("instagram");
    expect(sourceOf("https://x.com/a/status/1")).toBe("x");
    expect(sourceOf("https://youtu.be/abc")).toBe("youtube");
    expect(sourceOf("https://nytimes.com/x")).toBe("web");
    expect(sourceOf(null)).toBe("text");
    expect(fallbackTitle("https://x.com/naval/status/1")).toBe("Post by @naval on X");
    expect(fallbackTitle("https://blog.dev/posts/how-to-focus-better.html")).toBe("How to focus better");
  });
  it("reads page metadata", () => {
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Deep Work &amp; Focus"><meta name="description" content="A guide"><meta property="og:image" content="/img/cover.jpg"><meta property="og:site_name" content="Blog"></head>`;
    expect(parseMeta(html, "https://blog.dev/post")).toEqual({ title: "Deep Work & Focus", description: "A guide", imageUrl: "https://blog.dev/img/cover.jpg", siteName: "Blog" });
    expect(parseMeta("<title>Only title</title>", "https://a.com").title).toBe("Only title");
  });
  it("splits what the share sheet sends", () => {
    expect(splitShared({ text: "Read this later https://nytimes.com/a?utm_source=ig" })).toEqual({ url: "https://nytimes.com/a", note: "Read this later", title: null });
    expect(splitShared({ text: "Just an idea to remember" })).toEqual({ url: null, note: "Just an idea to remember", title: null });
    expect(splitShared({ url: "https://a.com/x", title: "A" })).toMatchObject({ url: "https://a.com/x", title: "A" });
  });
  it("pulls links out of exports", () => {
    const ig = JSON.stringify({ saved_saved_media: [{ title: "natgeo", string_map_data: { "Saved on": { href: "https://www.instagram.com/p/AAA/", timestamp: 1700000000 } } }] });
    expect(extractLinks(ig)).toEqual([{ url: "https://instagram.com/p/AAA", title: "Saved from @natgeo", savedAt: new Date(1700000000 * 1000) }]);
    const chrome = JSON.stringify({ ReadingList: [{ url: "https://a.com/1", title: "One", creation_time_usec: "1700000000000000" }] });
    expect(extractLinks(chrome)).toEqual([{ url: "https://a.com/1", title: "One", savedAt: new Date(1700000000000) }]);
    const html = `<DL><DT><A HREF="https://b.com/2" ADD_DATE="1700000000">Two &amp; more</A></DL>`;
    expect(extractLinks(html)).toEqual([{ url: "https://b.com/2", title: "Two & more", savedAt: new Date(1700000000000) }]);
    expect(extractLinks("see https://c.com/3. and https://c.com/3").map((l) => l.url)).toEqual(["https://c.com/3"]);
  });
  it("reads dates in many shapes", () => {
    expect(toDate(1700000000)?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(toDate("2024-01-02T00:00:00Z")?.getUTCFullYear()).toBe(2024);
    expect(toDate("13345678900000000")?.getUTCFullYear()).toBe(2023);
    expect(toDate(null)).toBeNull();
  });
});
