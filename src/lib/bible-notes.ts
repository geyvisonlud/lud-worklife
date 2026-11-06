/**
 * Chapter study notes, written by Claude the first time a chapter is opened and stored in BibleNote.
 * The NIV text itself is copyrighted, so the notes reference verses by number and paraphrase
 * rather than quote at length; the reader opens the NIV on BibleGateway beside them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { bookByName } from "./bible-books";
import { prisma } from "./db";
import type { Chapter } from "./bible-plan";

export const NOTES_MODEL = "claude-opus-5-5";
export const notesConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const ChapterNote = z.object({
  summary: z.string().describe("What happens or is taught in the chapter, 2–4 sentences"),
  context: z.string().describe("Historical, cultural or literary background that helps a modern reader, 2–4 sentences"),
  outline: z.array(z.object({ verses: z.string().describe('e.g. "1–11"'), title: z.string() })).describe("3–6 sections"),
  themes: z.array(z.string()).describe("2–4 short themes"),
  keyVerses: z.array(z.object({ ref: z.string().describe('e.g. "Genesis 1:27"'), note: z.string().describe("Why it matters, in your own words") })).describe("1–3"),
  crossReferences: z.array(z.object({ ref: z.string(), note: z.string() })).describe("2–4 connections elsewhere in Scripture"),
  reflection: z.string().describe("How this chapter can give strength and focus for today, 2–3 sentences, warm and practical"),
  question: z.string().describe("One question to think or pray about"),
});
export type ChapterNote = z.infer<typeof ChapterNote>;

const SYSTEM = `You write short study notes that sit beside a reader's daily Bible reading (they read the NIV). The reader is a Christian who wants to understand each chapter better and find strength and focus for the day.

Write in clear, warm English for a thoughtful lay reader. Be faithful to the text and to mainstream Christian scholarship: explain the historical and literary context, how the chapter fits its book and the whole story of Scripture, and point to Christ where the New Testament itself does. Where Christians hold different views (dating, authorship, end times, baptism and similar), say so briefly and fairly instead of taking a side.

Do not quote the NIV beyond a few words at a time — refer to verses by number and paraphrase. Never invent references: every cross-reference must be a real passage that genuinely connects.`;

/** Notes for these chapters, from the database or written now (in parallel) when missing. */
export async function notesFor(chapters: Chapter[]) {
  const have = await prisma.bibleNote.findMany({ where: { OR: chapters.map((c) => ({ book: c.book, chapter: c.chapter })) } });
  const key = (b: string, c: number) => `${b} ${c}`;
  const map = new Map(have.map((n) => [key(n.book, n.chapter), n.content as unknown as ChapterNote]));
  const missing = chapters.filter((c) => !map.has(key(c.book, c.chapter)));
  if (missing.length && notesConfigured()) {
    const written = await Promise.all(missing.map((c) => writeNote(c).catch((e) => (console.error("bible note", c, e), null))));
    written.forEach((n, i) => n && map.set(key(missing[i].book, missing[i].chapter), n));
  }
  return chapters.map((c) => ({ ...c, note: map.get(key(c.book, c.chapter)) ?? null }));
}

async function writeNote(c: Chapter): Promise<ChapterNote | null> {
  const book = bookByName(c.book);
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: NOTES_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(ChapterNote) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Study notes for ${c.book} ${c.chapter}${book ? ` (chapter ${c.chapter} of ${book.chapters}; ${book.testament === "OT" ? "Old" : "New"} Testament)` : ""}.`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  const note = response.parsed_output;
  await prisma.bibleNote.upsert({
    where: { book_chapter: { book: c.book, chapter: c.chapter } },
    create: { book: c.book, chapter: c.chapter, content: note as unknown as Prisma.InputJsonValue, model: response.model },
    update: {},
  });
  return note;
}
