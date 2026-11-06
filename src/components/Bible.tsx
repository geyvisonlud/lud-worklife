"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { setBibleDayRead, startBiblePlan } from "@/app/actions";
import { formatDay, monthName } from "@/lib/dates";
import { passageLabel, type Passage } from "@/lib/bible-plan";
import type { Book } from "@/lib/bible-books";
import { useReport, useWork } from "./TaskSheet";

/* ------------------------------------------------------------ mark read */

/** Shared read/unread state for plan days, so the day card, map and list stay in sync. */
function useReadDays(initial: number[]) {
  const report = useReport();
  const [done, setDone] = useState(() => new Set(initial));
  const [, start] = useTransition();
  const toggle = (day: number, next: boolean) => {
    setDone((s) => {
      const n = new Set(s);
      if (next) n.add(day);
      else n.delete(day);
      return n;
    });
    start(async () => {
      if (!report(await setBibleDayRead(day, next)))
        setDone((s) => {
          const n = new Set(s);
          if (next) n.delete(day);
          else n.add(day);
          return n;
        });
    });
  };
  return { done, toggle };
}

function ReadButton({ read, onClick }: { read: boolean; onClick: () => void }) {
  return (
    <button role="checkbox" aria-checked={read} onClick={onClick} className={`btn ${read ? "btn-secondary !text-good" : "btn-primary"}`}>
      <Dot done={read} size={16} />
      {read ? "Read" : "Mark as read"}
    </button>
  );
}

function Dot({ done, size = 18 }: { done: boolean; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: done ? "var(--good)" : "transparent", boxShadow: done ? "none" : "inset 0 0 0 1.6px currentColor" }}
      aria-hidden
    >
      {done && (
        <svg viewBox="0 0 16 16" width={size * 0.62} height={size * 0.62}>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/* ----------------------------------------------------------- home box */

export function BibleTodayBox(
  props: { started: false } | { started: true; day: number; ot: Passage[]; nt: Passage[]; read: boolean; behind: number; pct: number; catchUp: number | null },
) {
  const { done, toggle } = useReadDays(props.started && props.read ? [props.day] : []);
  if (!props.started) {
    return (
      <section className="card animate-in flex flex-wrap items-center gap-3">
        <BookOpen size={18} className="text-ink-3" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-medium">Read the whole Bible this year</div>
          <div className="text-[12.5px] text-ink-2">A daily guide: an Old Testament reading plus the New Testament and Psalms — about three chapters, 15 minutes.</div>
        </div>
        <Link href="/bible" className="btn btn-secondary">
          Start the plan
        </Link>
      </section>
    );
  }
  const { day, ot, nt, behind, pct, catchUp } = props;
  const read = done.has(day);
  return (
    <section className="card animate-in">
      <div className="card-head flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-mono">
          <Link href="/bible" className="inline-flex items-center gap-1.5 hover:text-ink">
            <BookOpen size={12} aria-hidden /> Bible reading · Day {day} ›
          </Link>
        </h2>
        <span className="num text-[12px] text-ink-3">
          {Math.round(pct * 100)}% of the year{behind > 0 ? ` · ${behind} to catch up` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-8 gap-y-2">
          <Track label="Old Testament" list={ot} />
          <Track label="New Testament & Psalms" list={nt} />
        </div>
        <ReadButton read={read} onClick={() => toggle(day, !read)} />
      </div>
      {behind > 0 && catchUp && (
        <p className="mt-3 text-[12.5px] text-warn">
          {behind} day{behind === 1 ? "" : "s"} to catch up —{" "}
          <Link href={`/bible?day=${catchUp}`} className="underline">
            start with day {catchUp}
          </Link>
          .
        </p>
      )}
    </section>
  );
}

function Track({ label, list, big }: { label: string; list: Passage[]; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="section-label mb-0.5">{label}</div>
      <div className={`${big ? "text-[24px] md:text-[28px]" : "text-[16px]"} font-medium tracking-[-0.015em]`}>{list.map(passageLabel).join(" · ") || "—"}</div>
    </div>
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

/* ------------------------------------------------- the guide (page) */

type DayInfo = { day: number; date: string; ot: Passage[]; nt: Passage[] };

/**
 * The reading guide: the selected day in large type with a short intro to each book, the year map,
 * and the whole plan day by day (grouped by month). All three share one read/unread state.
 */
export function BibleGuide({ selected, current, done: initialDone, days, books }: { selected: DayInfo; current: number; done: number[]; days: DayInfo[]; books: Book[] }) {
  const { done, toggle } = useReadDays(initialDone);
  const read = done.has(selected.day);
  const bookNames = [...new Set([...selected.ot, ...selected.nt].map((p) => p.book))];
  const months = groupByMonth(days);
  const [open, setOpen] = useState<string | null>(null);
  const openKey = open ?? months.find((m) => m.days.some((d) => d.day === selected.day))?.key ?? months[0]?.key;
  useEffect(() => setOpen(null), [selected.day]);

  return (
    <div className="space-y-5">
      <section className="card animate-in">
        <div className="card-head flex flex-wrap items-center justify-between gap-2">
          <h2 className="label-mono">
            Day {selected.day} · {formatDay(selected.date, { long: true })}
            {selected.day === current ? " · today" : ""}
          </h2>
          <ReadButton read={read} onClick={() => toggle(selected.day, !read)} />
        </div>
        <div className="flex flex-wrap gap-x-12 gap-y-4 py-1">
          <Track label="Old Testament" list={selected.ot} big />
          <Track label="New Testament & Psalms" list={selected.nt} big />
        </div>
        <ul className="mt-5 grid gap-x-8 gap-y-3 border-t border-hairline pt-4 md:grid-cols-2">
          {bookNames.map((n) => {
            const b = books.find((x) => x.name === n);
            if (!b) return null;
            return (
              <li key={n}>
                <div className="text-[14px] font-medium">{n}</div>
                <p className="text-[12.5px] leading-snug text-ink-2">{b.theme}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {b.author} · {b.written} · {b.chapters} {b.chapters === 1 ? "chapter" : "chapters"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card animate-in">
        <div className="card-head flex flex-wrap items-center justify-between gap-2">
          <h2 className="label-mono">The year</h2>
          <div className="flex flex-wrap gap-4 text-[11.5px] text-ink-3">
            <Legend color="var(--good)" label="Read" />
            <Legend color="var(--accent)" label="Today" />
            <Legend color="var(--warn-soft)" ring="var(--warn)" label="To catch up" />
          </div>
        </div>
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {months.map((m) => (
            <div key={m.key}>
              <div className="section-label mb-1">{m.label}</div>
              <div className="flex flex-wrap gap-[3px]">
                {m.days.map((d) => {
                  const isRead = done.has(d.day);
                  const past = d.day < current;
                  return (
                    <Link
                      key={d.day}
                      href={`/bible?day=${d.day}`}
                      scroll={false}
                      title={`Day ${d.day} · ${[...d.ot, ...d.nt].map(passageLabel).join(" · ")}`}
                      aria-label={`Day ${d.day}${isRead ? ", read" : ""}`}
                      className="h-[14px] w-[14px] rounded-[3px] transition-transform hover:scale-125"
                      style={{
                        background: isRead ? "var(--good)" : d.day === current ? "var(--accent)" : past ? "var(--warn-soft)" : "var(--surface-3)",
                        boxShadow: d.day === selected.day ? "0 0 0 1.5px var(--surface), 0 0 0 3px var(--ink)" : past && !isRead ? "inset 0 0 0 1px var(--warn)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card animate-in !p-0">
        <div className="border-b border-hairline px-5 py-3">
          <h2 className="label-mono">The whole plan</h2>
        </div>
        {months.map((m) => {
          const readInMonth = m.days.filter((d) => done.has(d.day)).length;
          const isOpen = openKey === m.key;
          return (
            <div key={m.key} className="border-b border-hairline last:border-b-0">
              <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : m.key)}>
                <span className="text-[14.5px] font-medium">{m.label}</span>
                <span className="num text-[12px] text-ink-3">
                  Days {m.days[0].day}–{m.days[m.days.length - 1].day}
                </span>
                <span className="num ml-auto text-[12px] text-ink-2">
                  {readInMonth}/{m.days.length} read
                </span>
                <span className={`text-ink-3 transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>
              {isOpen && (
                <ul className="px-5 pb-3">
                  {m.days.map((d) => {
                    const isRead = done.has(d.day);
                    const late = d.day < current && !isRead;
                    return (
                      <li key={d.day} className={`list-row flex items-center gap-3 py-2 ${d.day === selected.day ? "-mx-2 rounded-lg bg-accent-soft px-2" : ""}`}>
                        <button
                          role="checkbox"
                          aria-checked={isRead}
                          aria-label={`Day ${d.day} ${isRead ? "read" : "not read"}`}
                          onClick={() => toggle(d.day, !isRead)}
                          className={isRead ? "text-good" : late ? "text-warn" : "text-ink-3"}
                        >
                          <Dot done={isRead} />
                        </button>
                        <Link href={`/bible?day=${d.day}`} scroll={false} className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                          <span className={`num w-[88px] shrink-0 text-[12px] ${d.day === current ? "font-semibold text-accent" : "text-ink-3"}`}>
                            Day {d.day} · {Number(d.date.slice(8))} {monthName(Number(d.date.slice(5, 7)))}
                          </span>
                          <span className={`min-w-0 text-[14px] ${isRead ? "text-ink-3" : ""}`}>{[...d.ot, ...d.nt].map(passageLabel).join(" · ")}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Legend({ color, ring, label }: { color: string; ring?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color, boxShadow: ring ? `inset 0 0 0 1px ${ring}` : undefined }} /> {label}
    </span>
  );
}

function groupByMonth(days: DayInfo[]) {
  const out: { key: string; label: string; days: DayInfo[] }[] = [];
  for (const d of days) {
    const key = d.date.slice(0, 7);
    let g = out.find((x) => x.key === key);
    if (!g) out.push((g = { key, label: `${monthName(Number(d.date.slice(5, 7)))} ${d.date.slice(0, 4)}`, days: [] }));
    g.days.push(d);
  }
  return out;
}
