"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { loadBibleNotes, setBibleDayRead, startBiblePlan } from "@/app/actions";
import { formatDay } from "@/lib/dates";
import { passageLabel, type Chapter, type Passage } from "@/lib/bible-plan";
import type { Book } from "@/lib/bible-books";
import type { ChapterNote } from "@/lib/bible-notes";
import { useReport, useWork } from "./TaskSheet";

/* ------------------------------------------------------------ mark read */

export function ReadToggle({ day, read, size = "md" }: { day: number; read: boolean; size?: "sm" | "md" }) {
  const report = useReport();
  const [on, setOn] = useState(read);
  const [, start] = useTransition();
  useEffect(() => setOn(read), [read]);
  return (
    <button
      role="checkbox"
      aria-checked={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          if (!report(await setBibleDayRead(day, next))) setOn(!next);
        });
      }}
      className={`btn ${on ? "btn-secondary !text-good" : "btn-primary"} ${size === "sm" ? "!px-3 !py-1 !text-[12.5px]" : ""}`}
    >
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
        style={{ background: on ? "var(--good)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.6px currentColor" }}
        aria-hidden
      >
        {on && (
          <svg viewBox="0 0 16 16" width="10" height="10">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {on ? "Read" : "Mark as read"}
    </button>
  );
}

/* ----------------------------------------------------------- home box */

export function BibleTodayBox(
  props:
    | { started: false }
    | { started: true; day: number; ot: Passage[]; nt: Passage[]; url: string; read: boolean; behind: number; pct: number; catchUp: number | null },
) {
  if (!props.started) {
    return (
      <section className="card animate-in flex flex-wrap items-center gap-3">
        <BookOpen size={18} className="text-ink-3" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-medium">Read the whole Bible this year</div>
          <div className="text-[12.5px] text-ink-2">About 15 minutes a day — Old Testament plus New Testament and Psalms, with study notes beside each chapter.</div>
        </div>
        <Link href="/bible" className="btn btn-secondary">
          Start the plan
        </Link>
      </section>
    );
  }
  const { day, ot, nt, url, read, behind, pct, catchUp } = props;
  return (
    <section className="card animate-in">
      <div className="card-head flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-mono">
          <Link href="/bible" className="inline-flex items-center gap-1.5 hover:text-ink">
            <BookOpen size={12} aria-hidden /> Bible reading · Day {day} ›
          </Link>
        </h2>
        <span className="num text-[12px] text-ink-3">
          {Math.round(pct * 100)}% of the year{behind > 0 ? ` · ${behind} behind` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
          {[
            { label: "Old Testament", list: ot },
            { label: "New Testament & Psalms", list: nt },
          ].map((t) => (
            <div key={t.label} className="min-w-0">
              <div className="section-label mb-0.5">{t.label}</div>
              <div className="text-[16px] font-medium tracking-[-0.01em]">{t.list.map(passageLabel).join(" · ") || "—"}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary">
            Read in NIV <ExternalLink size={12} className="text-ink-3" />
          </a>
          <Link href={`/bible?day=${day}`} className="btn btn-ghost">
            Study notes
          </Link>
          <ReadToggle day={day} read={read} />
        </div>
      </div>
      {behind > 0 && catchUp && (
        <p className="mt-3 text-[12.5px] text-warn">
          You have {behind} day{behind === 1 ? "" : "s"} to catch up —{" "}
          <Link href={`/bible?day=${catchUp}`} className="underline">
            start with day {catchUp}
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------- start form */

export function StartPlan({ restart = false, current }: { restart?: boolean; current?: string }) {
  const { today } = useWork();
  const report = useReport();
  const [date, setDate] = useState(current ?? today);
  const [pending, start] = useTransition();
  const jan1 = `${today.slice(0, 4)}-01-01`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[12.5px] text-ink-2">
        Start date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input mt-1 !py-1.5 !text-[14px]" />
      </label>
      {!restart && (
        <button type="button" className="btn btn-ghost" onClick={() => setDate(jan1)}>
          Jan 1
        </button>
      )}
      <button className={`btn ${restart ? "btn-danger" : "btn-primary"}`} disabled={pending} onClick={() => start(async () => void report(await startBiblePlan(date, restart)))}>
        {restart ? "Restart plan" : "Start the plan"}
      </button>
    </div>
  );
}

/* ----------------------------------------------------- reader + notes */

type NoteChapter = Chapter & { note: ChapterNote | null };

/** The day's passages on one side, study notes for each chapter on the other. */
export function BibleReader({ day, date, ot, nt, url, read, books }: { day: number; date: string; ot: Passage[]; nt: Passage[]; url: string; read: boolean; books: Book[] }) {
  const [notes, setNotes] = useState<{ configured: boolean; chapters: NoteChapter[] } | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    setNotes(null);
    setActive(0);
    loadBibleNotes(day)
      .then((r) => alive && setNotes(r as { configured: boolean; chapters: NoteChapter[] }))
      .catch(() => alive && setNotes({ configured: true, chapters: [] }));
    return () => {
      alive = false;
    };
  }, [day]);
  const current = notes?.chapters[active];
  const bookOf = (name: string) => books.find((b) => b.name === name);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* passages */}
      <section className="card animate-in self-start">
        <div className="card-head flex items-center justify-between gap-2">
          <h2 className="label-mono">Day {day} · {formatDay(date)}</h2>
          <span className="text-[12px] text-ink-3">NIV</span>
        </div>
        <div className="space-y-4">
          {[
            { label: "Old Testament", list: ot },
            { label: "New Testament & Psalms", list: nt },
          ].map((t) => (
            <div key={t.label}>
              <div className="section-label mb-1">{t.label}</div>
              {t.list.map((p) => {
                const b = bookOf(p.book);
                return (
                  <div key={p.book + p.from} className="mb-2">
                    <div className="text-[20px] font-medium tracking-[-0.015em]">{passageLabel(p)}</div>
                    {b && (
                      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
                        <span className="text-ink-3">
                          {b.author} · {b.written}.
                        </span>{" "}
                        {b.theme}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary">
            <BookOpen size={14} /> Read in NIV <ExternalLink size={12} className="text-ink-3" />
          </a>
          <ReadToggle day={day} read={read} />
        </div>
        <p className="mt-3 text-[11.5px] text-ink-3">The NIV text opens on BibleGateway (it can’t be copied into the app). Keep it side by side with the notes.</p>
      </section>

      {/* notes */}
      <section className="card animate-in">
        <div className="card-head flex flex-wrap items-center gap-2">
          <h2 className="label-mono inline-flex items-center gap-1.5">
            <Sparkles size={12} aria-hidden /> Study notes
          </h2>
          <div className="ml-auto flex flex-wrap gap-1">
            {(notes?.chapters ?? []).map((c, i) => (
              <button key={c.book + c.chapter} onClick={() => setActive(i)} aria-pressed={active === i} className="chip">
                {c.book === "Psalms" ? "Psalm" : c.book} {c.chapter}
              </button>
            ))}
          </div>
        </div>
        {!notes ? (
          <div className="flex items-center gap-2 py-10 text-[14px] text-ink-2">
            <Loader2 size={16} className="animate-spin" /> Preparing the notes for today’s chapters… the first time can take up to a minute.
          </div>
        ) : !notes.configured && !notes.chapters.some((c) => c.note) ? (
          <p className="py-8 text-center text-[14px] text-ink-2">Set ANTHROPIC_API_KEY in Vercel to add study notes for each chapter (written by Claude once, then kept).</p>
        ) : current?.note ? (
          <NoteView c={current} note={current.note} />
        ) : (
          <p className="py-8 text-center text-[14px] text-ink-2">The notes for this chapter couldn’t be written right now. Reload the page to try again.</p>
        )}
      </section>
    </div>
  );
}

function NoteView({ c, note }: { c: Chapter; note: ChapterNote }) {
  return (
    <article className="space-y-4 text-[14.5px] leading-[1.6]">
      <h3 className="text-[22px] font-medium tracking-[-0.02em]">
        {c.book === "Psalms" ? "Psalm" : c.book} {c.chapter}
      </h3>
      <p>{note.summary}</p>
      <div className="rounded-xl bg-surface-2 px-4 py-3">
        <div className="section-label mb-1">Context</div>
        <p className="text-[14px] text-ink-2">{note.context}</p>
      </div>
      {note.outline.length > 0 && (
        <div>
          <div className="section-label mb-1">Outline</div>
          <ul className="space-y-0.5">
            {note.outline.map((o) => (
              <li key={o.verses + o.title} className="flex gap-3 text-[14px]">
                <span className="num w-[72px] shrink-0 whitespace-nowrap text-ink-3">v. {o.verses}</span>
                <span>{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {note.themes.map((t) => (
          <span key={t} className="pill !py-0.5 !text-[12px]">
            {t}
          </span>
        ))}
      </div>
      {note.keyVerses.length > 0 && (
        <div>
          <div className="section-label mb-1">Key verses</div>
          <ul className="space-y-1.5">
            {note.keyVerses.map((k) => (
              <li key={k.ref} className="text-[14px]">
                <span className="font-medium">{k.ref}</span> — <span className="text-ink-2">{k.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note.crossReferences.length > 0 && (
        <div>
          <div className="section-label mb-1">See also</div>
          <ul className="space-y-1.5">
            {note.crossReferences.map((x) => (
              <li key={x.ref} className="text-[14px]">
                <a href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(x.ref)}&version=NIV`} target="_blank" rel="noreferrer" className="font-medium text-accent">
                  {x.ref}
                </a>{" "}
                — <span className="text-ink-2">{x.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-xl border border-hairline px-4 py-3">
        <div className="section-label mb-1">For today</div>
        <p>{note.reflection}</p>
        <p className="mt-2 text-[14px] italic text-ink-2">{note.question}</p>
      </div>
      <p className="text-[11px] text-ink-3">Notes written by Claude from mainstream Christian scholarship. Check what matters with your Bible and your church.</p>
    </article>
  );
}

/* --------------------------------------------------------- year map */

/** The 365 days as small squares by month: read, missed, today, ahead. Click to open a day. */
export function PlanMap({ start, current, done, selected }: { start: string; current: number; done: number[]; selected: number }) {
  const set = new Set(done);
  const months: { key: string; label: string; days: number[] }[] = [];
  for (let d = 1; d <= 365; d++) {
    const [y, m, dd] = start.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, dd + d - 1));
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    let g = months.find((x) => x.key === key);
    if (!g) months.push((g = { key, label: date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), days: [] }));
    g.days.push(d);
  }
  return (
    <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {months.map((m) => (
        <div key={m.key}>
          <div className="section-label mb-1">{m.label}</div>
          <div className="flex flex-wrap gap-[3px]">
            {m.days.map((d) => {
              const isRead = set.has(d);
              const past = d < current;
              const bg = isRead ? "var(--good)" : d === current ? "var(--accent)" : past ? "var(--warn-soft)" : "var(--surface-3)";
              return (
                <Link
                  key={d}
                  href={`/bible?day=${d}`}
                  title={`Day ${d}${isRead ? " · read" : past ? " · not read yet" : ""}`}
                  aria-label={`Day ${d}${isRead ? ", read" : ""}`}
                  className="h-[14px] w-[14px] rounded-[3px] transition-transform hover:scale-125"
                  style={{ background: bg, boxShadow: d === selected ? "0 0 0 1.5px var(--surface), 0 0 0 3px var(--ink)" : past && !isRead ? "inset 0 0 0 1px var(--warn)" : undefined }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
