import { describe, expect, it } from "vitest";
import { articleToMarkdown, extractArticle, readingMinutes, sanitizeArticle } from "./reader";

describe("reader view", () => {
  it("keeps only safe tags and attributes", () => {
    const dirty = `<h1>Title</h1><p onclick="x()">Hello <b>bold</b> <a href="javascript:alert(1)">bad</a> <a href="/ok">ok</a></p><script>alert(1)</script><iframe src="https://evil"></iframe><img src="/a.png" onerror="x" alt="A"><div style="color:red"><span>kept text</span></div>`;
    expect(sanitizeArticle(dirty, "https://site.com/post")).toBe(
      `<h2>Title</h2><p>Hello <strong>bold</strong> bad <a href="https://site.com/ok" target="_blank" rel="noopener noreferrer nofollow">ok</a></p><img src="https://site.com/a.png" alt="A" loading="lazy" referrerpolicy="no-referrer">kept text`,
    );
  });
  it("finds the article in a page", () => {
    const para = "Focus is the ability to direct attention to what matters and keep it there for a long time. ".repeat(12);
    const html = `<html><head><title>Deep focus | Blog</title></head><body><nav>Menu Home About</nav><article><h1>Deep focus</h1><p>${para}</p><p><img src="/img/desk.jpg" alt="Desk"></p><p>${para}</p></article><footer>© 2026</footer></body></html>`;
    const a = extractArticle(html, "https://blog.dev/focus");
    expect(a).not.toBeNull();
    expect(a!.content).toContain("Focus is the ability");
    expect(a!.content).toContain('src="https://blog.dev/img/desk.jpg"');
    expect(a!.content).not.toContain("Menu Home");
    expect(a!.readMinutes).toBeGreaterThanOrEqual(1);
    expect(extractArticle("<html><body><p>Too short</p></body></html>", "https://x.com")).toBeNull();
  });
  it("turns the reader view into Markdown", () => {
    expect(articleToMarkdown("<h2>Notes</h2><p>Read <strong>this</strong></p><ul><li>One</li></ul>")).toBe("## Notes\n\nRead **this**\n\n-   One");
    expect(readingMinutes("word ".repeat(660))).toBe(3);
  });
});
