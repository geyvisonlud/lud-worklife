"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { layoutDay } from "@/lib/calendar-layout";
import { formatClock, formatClockRange, formatDuration, minutesInTz } from "@/lib/dates";
import { dayWindow, hourTicks, nowAndNext, openMinutes, untilLabel } from "@/lib/day-overview";

export type RibbonItem = {
  id: string;
  kind: "event" | "task";
  title: string;
  start: number; // wall-clock minutes after midnight
  end: number;
  color: string;
  muted?: boolean; // declined event / finished task
};

type Figure = { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad"; href?: string };

/**
 * The overview at the top of Today: greeting, what's on now / next, and the day ribbon — today laid
 * out on one line (events in their calendar colors, focus blocks hatched, a "now" marker, the past
 * faded) — with the day's figures underneath.
 */
export function DayOverview({
  greeting,
  dateLabel,
  tz,
  initialNow,
  items,
  allDay,
  figures,
}: {
  greeting: string;
  dateLabel: string;
  tz: string;
  initialNow: number;
  items: RibbonItem[];
  allDay: { title: string; color: string }[];
  figures: Figure[];
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const tick = () => setNow(minutesInTz(new Date(), tz));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [tz]);

  const win = dayWindow(items);
  const span = win.end - win.start;
  const pct = (m: number) => ((Math.min(Math.max(m, win.start), win.end) - win.start) / span) * 100;
  const placed = layoutDay(items.map((i) => ({ id: i.id, start: i.start, end: i.end })), 10);
  const byId = new Map(items.map((i) => [i.id, i]));
  const live = items.filter((i) => !i.muted);
  const { current, next } = nowAndNext(live, now);
  const open = openMinutes(win, live.map((i) => ({ start: i.start, end: i.end })), now);
  const inDay = now >= win.start && now <= win.end;

  return (
    <section className="card animate-in !px-0 !pb-0">
      {/* greeting + now/next */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-[var(--pad-x)]">
        <div className="min-w-0">
          <div className="label-mono mb-2">{dateLabel}</div>
          <h1 className="display text-[38px] leading-[1.02] md:text-[48px]">{greeting}</h1>
          <p className="mt-2 text-[14px] text-ink-2">
            {current ? (
              <>
                <span className="font-medium text-ink">Now:</span> {current.title} · until {formatClock(current.end)}
                {next ? (
                  <>
                    {" "}
                    · then {next.title} at {formatClock(next.start)}
                  </>
                ) : null}
              </>
            ) : next ? (
              <>
                <span className="font-medium text-ink">Next:</span> {next.title} at {formatClock(next.start)} · {untilLabel(next.start - now)}
              </>
            ) : (
              "Nothing else on the calendar today."
            )}
          </p>
        </div>
        <Link href="/calendar" className="btn btn-secondary">
          Plan the week <ArrowRight size={14} />
        </Link>
      </div>

      {/* all-day */}
      {allDay.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5 px-[var(--pad-x)]">
          {allDay.map((e) => (
            <span key={e.title} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-[12px]">
              <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
              {e.title}
            </span>
          ))}
        </div>
      )}

      {/* the day ribbon */}
      <Link href="/calendar?view=day" className="group mt-5 block px-[var(--pad-x)]" aria-label="Open today in the calendar">
        <div className="relative h-[46px] rounded-[10px] bg-surface-2" style={{ boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
          {/* hour grid */}
          {Array.from({ length: Math.floor(span / 60) - 1 }, (_, i) => win.start + (i + 1) * 60).map((m) => (
            <span key={m} className="absolute inset-y-0 w-px bg-[var(--grid)]" style={{ left: `${pct(m)}%` }} aria-hidden />
          ))}
          {placed.map((p) => {
            const it = byId.get(p.id)!;
            const left = pct(it.start);
            const width = Math.max(0.6, pct(it.end) - left);
            const lane = 100 / p.cols;
            const isTask = it.kind === "task";
            return (
              <span
                key={it.id}
                title={`${it.title} · ${formatClockRange(it.start, it.end)}`}
                className={`absolute overflow-hidden rounded-[6px] px-1.5 text-[11px] font-medium leading-none transition-[filter] group-hover:brightness-[0.98] ${it.muted ? "opacity-40" : ""}`}
                style={{
                  left: `${left}%`,
                  width: `calc(${width}% - 2px)`,
                  top: `calc(${p.col * lane}% + 4px)`,
                  height: `calc(${lane}% - ${p.cols > 1 ? 5 : 8}px)`,
                  background: isTask
                    ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${it.color} 32%, var(--surface)) 0 5px, color-mix(in srgb, ${it.color} 14%, var(--surface)) 5px 10px)`
                    : `color-mix(in srgb, ${it.color} 78%, var(--surface))`,
                  boxShadow: isTask ? `inset 0 0 0 1.5px color-mix(in srgb, ${it.color} 70%, transparent)` : undefined,
                  color: isTask ? "var(--ink)" : "#fff",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {width > 7 && p.cols === 1 && <span className="truncate">{it.title}</span>}
              </span>
            );
          })}
          {/* the past, faded */}
          {inDay && <span className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[10px]" style={{ width: `${pct(now)}%`, background: "color-mix(in srgb, var(--surface-2) 55%, transparent)" }} aria-hidden />}
          {/* now */}
          {inDay && (
            <span className="pointer-events-none absolute -bottom-1.5 -top-1.5 z-10 w-0" style={{ left: `${pct(now)}%` }} aria-hidden>
              <span className="absolute -left-px inset-y-0 w-[2px] rounded-full bg-bad" />
              <span className="absolute -left-[4px] -top-[3px] h-[8px] w-[8px] rounded-full bg-bad" />
            </span>
          )}
        </div>
        {/* hours */}
        <div className="relative mt-1.5 h-4 text-[10.5px] text-ink-3">
          {hourTicks(win, 3).map((m) => (
            <span key={m} className={`num absolute whitespace-nowrap ${pct(m) > 92 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${pct(m)}%` }}>
              {formatClock(m)}
            </span>
          ))}
        </div>
      </Link>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-[var(--pad-x)] text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[2px] bg-[var(--c1)]" /> Events, in their calendar colors
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[2px]" style={{ background: "repeating-linear-gradient(135deg, var(--ink-3) 0 2px, transparent 2px 4px)" }} /> Focus blocks
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-ink-2">{formatDuration(open)}</span> still open today
        </span>
      </div>

      {/* figures */}
      <dl className="mt-4 grid grid-cols-2 border-t border-hairline sm:grid-cols-3 lg:grid-cols-6">
        {figures.map((f, i) => {
          const body = (
            <>
              <dt className="label-mono !text-[10px]">{f.label}</dt>
              <dd className={`num mt-1.5 text-[19px] font-semibold ${f.tone === "bad" ? "text-bad" : f.tone === "warn" ? "text-warn" : f.tone === "good" ? "text-good" : ""}`}>{f.value}</dd>
              {f.hint && <dd className="truncate text-[11.5px] text-ink-2">{f.hint}</dd>}
            </>
          );
          const cls = `block min-w-0 px-[var(--pad-x)] py-3.5 ${i > 0 ? "border-l border-hairline" : ""} max-lg:[&:nth-child(n+4)]:border-t max-sm:[&:nth-child(odd)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t lg:max-xl:px-4`;
          return f.href ? (
            <Link key={f.label} href={f.href} className={`${cls} transition-colors hover:bg-surface-2`}>
              {body}
            </Link>
          ) : (
            <div key={f.label} className={cls}>
              {body}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
