"use client";

/* Fantastical-style pieces of the calendar: mini month, agenda list, month grid and year grid. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Search, Video, X } from "lucide-react";
import { projectColor } from "@/lib/colors";
import {
  addMonths,
  agenda,
  agendaLabel,
  busyDays,
  eventsOnDay,
  firstOfMonth,
  itemTime,
  matchesSearch,
  monthStartLabel,
  monthTitle,
  monthWeeks,
  shortDate,
  visibleRows,
  weekdayLetters,
  type DayItem,
} from "@/lib/calendar-month";
import { addDays, daysBetween, formatClock, weekday } from "@/lib/dates";
import type { EventDTO, TaskDTO } from "@/lib/data";
import { TaskCheck } from "./TaskBits";

export const textOn = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 165 ? "#151513" : "#fff";
};

const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;

/* ------------------------------------------------------------ mini month */

/** Small month with a dot under busy days. `size="lg"` is the phone version (full width). */
export function MiniMonth({
  month,
  onMonth,
  selected,
  range,
  today,
  weekStart,
  busy,
  onPick,
  size = "sm",
  bare = false,
}: {
  month: string;
  onMonth: (first: string) => void;
  selected: string;
  /** Days shown in the main view, lightly highlighted. */
  range?: string[];
  today: string;
  weekStart: number;
  busy: Map<string, number>;
  onPick: (day: string) => void;
  size?: "sm" | "lg";
  /** No month title / arrows (the page toolbar has them). */
  bare?: boolean;
}) {
  const weeks = monthWeeks(month, weekStart, true);
  const inRange = new Set(range ?? []);
  const lg = size === "lg";
  const [name, year] = monthTitle(month).split(" ");
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1 px-1 ${bare ? "hidden" : ""}`}>
        <div className={`${lg ? "text-[19px]" : "text-[14px]"} font-semibold tracking-[-0.01em]`}>
          {name} <span className="font-normal text-bad">{year}</span>
        </div>
        <button className="ml-auto rounded-[7px] p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft size={lg ? 18 : 15} />
        </button>
        <button className="rounded-[7px] p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => onMonth(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight size={lg ? 18 : 15} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {weekdayLetters(weekStart).map((l, i) => (
          <div key={i} className={`pb-1 font-medium text-ink-3 ${lg ? "text-[11.5px]" : "text-[10.5px]"}`}>
            {l}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const out = day.slice(0, 7) !== month.slice(0, 7);
          const isToday = day === today;
          const sel = day === selected;
          const n = busy.get(day) ?? 0;
          return (
            <button
              key={day}
              onClick={() => onPick(day)}
              className={`relative flex flex-col items-center justify-center ${lg ? "h-[46px]" : "h-[30px]"} ${inRange.has(day) && !lg ? "bg-surface-2" : ""} ${
                inRange.has(day) && !lg ? "first:rounded-l-[7px]" : ""
              }`}
              aria-label={`${day}${n ? `, ${n} events` : ""}`}
              aria-current={isToday ? "date" : undefined}
            >
              <span
                className={`num inline-flex items-center justify-center rounded-full ${lg ? "h-8 w-8 text-[16px]" : "h-[22px] w-[22px] text-[12px]"} ${
                  isToday ? "bg-bad font-semibold text-white" : sel ? "bg-ink font-semibold text-surface" : out ? "text-ink-3" : isWeekend(day) ? "text-ink-2" : "text-ink"
                }`}
              >
                {Number(day.slice(8))}
              </span>
              <span className={`absolute ${lg ? "bottom-[3px]" : "bottom-0"} flex gap-[2px]`} aria-hidden>
                {Array.from({ length: Math.min(3, n) }, (_, i) => (
                  <span key={i} className={`h-[3px] w-[3px] rounded-full ${out ? "bg-ink-3/60" : "bg-ink-3"}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- agenda */

export type AgendaTask = { task: TaskDTO; day: string; start: number; end: number };

/** The list under the mini calendar: days with their events (and task time blocks), or search results. */
export function AgendaList({
  events,
  tasks,
  projects,
  from,
  days = 21,
  today,
  tz,
  query,
  onOpen,
  onOpenTask,
}: {
  events: EventDTO[];
  tasks: AgendaTask[];
  projects: { id: string; name: string; color: string }[];
  from: string;
  days?: number;
  today: string;
  tz: string;
  query: string;
  onOpen: (e: EventDTO) => void;
  onOpenTask: (t: TaskDTO) => void;
}) {
  const list = useMemo(() => {
    if (query.trim()) {
      // Search: every loaded day that has a match.
      const hits = events.filter((e) => matchesSearch(e, query));
      if (!hits.length) return [];
      const first = addDays(hits.reduce((m, e) => (e.start.slice(0, 10) < m ? e.start.slice(0, 10) : m), hits[0].start.slice(0, 10)), -1);
      const last = hits.reduce((m, e) => (e.end.slice(0, 10) > m ? e.end.slice(0, 10) : m), hits[0].end.slice(0, 10));
      return agenda(hits, first, Math.min(800, daysBetween(first, last) + 2), tz);
    }
    return agenda(events, from, days, tz, from);
  }, [events, from, days, tz, query]);
  const tasksBy = (day: string) => tasks.filter((t) => t.day === day);

  if (!list.length)
    return <p className="px-2 py-6 text-center text-[13px] text-ink-3">{query ? "No events match." : "Nothing coming up."}</p>;
  return (
    <div className="space-y-3">
      {list.map(({ day, items }) => {
        const ts = query ? [] : tasksBy(day);
        return (
          <section key={day}>
            <h3 className={`sticky top-0 z-[1] flex items-baseline justify-between bg-[var(--agenda-bg,var(--surface))] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${day === today ? "text-bad" : "text-ink-2"}`}>
              <span>{agendaLabel(day, today)}</span>
              <span className="num font-medium tracking-normal text-ink-3">{shortDate(day)}</span>
            </h3>
            <div className="space-y-px">
              {items.map((it) => (
                <AgendaRow key={it.event.id} it={it} onOpen={onOpen} />
              ))}
              {ts.map(({ task: t, start, end }) => (
                <button key={t.id} onClick={() => onOpenTask(t)} className="flex w-full items-start gap-2.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className="pt-[2px]" onClick={(e) => e.stopPropagation()}>
                    <TaskCheck task={t} size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] font-medium ${t.status === "done" ? "text-ink-3 line-through" : ""}`}>{t.title}</span>
                    <span className="num block truncate text-[11.5px] text-ink-3">
                      {formatClock(start)} – {formatClock(end % 1440)}
                      {t.projectId && (
                        <>
                          {" · "}
                          <span style={{ color: projectColor(projects.find((p) => p.id === t.projectId)?.color).hex }}>{projects.find((p) => p.id === t.projectId)?.name}</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>
              ))}
              {!items.length && !ts.length && <p className="px-2 py-1 text-[12.5px] text-ink-3">No events</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AgendaRow({ it, onOpen }: { it: DayItem<EventDTO>; onOpen: (e: EventDTO) => void }) {
  const e = it.event;
  if (e.allDay)
    return (
      <button
        onClick={() => onOpen(e)}
        className={`mx-1 my-0.5 block w-[calc(100%-8px)] truncate rounded-[6px] px-2 py-[3px] text-left text-[12.5px] font-medium ${e.declined ? "opacity-55" : ""}`}
        style={{ background: e.color, color: textOn(e.color) }}
      >
        {e.title}
      </button>
    );
  return (
    <div className={`group flex items-start gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-surface-2 ${e.declined ? "opacity-55" : ""}`}>
      <button onClick={() => onOpen(e)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
        <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] font-medium ${e.declined ? "line-through" : ""}`}>{e.title}</span>
          <span className="num block truncate text-[11.5px] text-ink-3">{itemTime(it)}</span>
          {e.location && (
            <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-ink-3">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{e.location}</span>
            </span>
          )}
        </span>
      </button>
      {e.meetLink && (
        <a href={e.meetLink} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-[3px] text-[11px] font-semibold text-white hover:brightness-110">
          <Video size={11} /> Join
        </a>
      )}
    </div>
  );
}

/** Search field for the agenda. */
export function AgendaSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search events" aria-label="Search events" className="input !rounded-[9px] !py-1.5 !pl-7 !pr-7 !text-[13px]" />
      {value && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" onClick={() => onChange("")} aria-label="Clear search">
          <X size={13} />
        </button>
      )}
    </label>
  );
}

/* ------------------------------------------------------------ month grid */

const ROW = 19; // px per event row in a month cell

/** Month view: a cell per day with all-day bars, timed events (dot, title, time) and "N more…". */
export function MonthGrid({
  anchor,
  weekStart,
  today,
  tz,
  events,
  tasks,
  colorOf,
  onOpen,
  onOpenTask,
  onDay,
  onCreate,
}: {
  anchor: string;
  weekStart: number;
  today: string;
  tz: string;
  events: EventDTO[];
  tasks: TaskDTO[];
  colorOf: (t: TaskDTO) => string;
  onOpen: (e: EventDTO) => void;
  onOpenTask: (t: TaskDTO) => void;
  onDay: (day: string) => void;
  onCreate: (day: string) => void;
}) {
  const weeks = monthWeeks(anchor, weekStart);
  const month = anchor.slice(0, 7);
  const grid = useRef<HTMLDivElement>(null);
  const [cellH, setCellH] = useState(120);
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => setCellH(el.clientHeight / weeks.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks.length]);
  const capacity = Math.max(1, Math.floor((cellH - 30) / ROW));

  return (
    <div className="flex h-[calc(100vh-150px)] min-h-[520px] flex-col">
      <div className="grid grid-cols-7 border-b border-hairline">
        {weekdayLetters(weekStart, true).map((d, i) => (
          <div key={i} className="px-2 py-1.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            {d}
          </div>
        ))}
      </div>
      <div ref={grid} className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week) => (
          <div key={week[0]} className="grid min-h-0 grid-cols-7 border-b border-hairline last:border-b-0">
            {week.map((day) => (
              <MonthCell
                key={day}
                day={day}
                out={day.slice(0, 7) !== month}
                today={today}
                tz={tz}
                events={events}
                tasks={tasks}
                capacity={capacity}
                colorOf={colorOf}
                onOpen={onOpen}
                onOpenTask={onOpenTask}
                onDay={onDay}
                onCreate={onCreate}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCell({
  day,
  out,
  today,
  tz,
  events,
  tasks,
  capacity,
  colorOf,
  onOpen,
  onOpenTask,
  onDay,
  onCreate,
}: {
  day: string;
  out: boolean;
  today: string;
  tz: string;
  events: EventDTO[];
  tasks: TaskDTO[];
  capacity: number;
  colorOf: (t: TaskDTO) => string;
  onOpen: (e: EventDTO) => void;
  onOpenTask: (t: TaskDTO) => void;
  onDay: (day: string) => void;
  onCreate: (day: string) => void;
}) {
  const items = eventsOnDay(events, day, tz);
  const dayTasks = tasks.filter((t) => (t.scheduledStart ? ymdOf(t.scheduledStart, tz) === day : t.status !== "done" && t.dueDate === day));
  const total = items.length + dayTasks.length;
  const { shown, more } = visibleRows(total, capacity);
  const isToday = day === today;
  const first = day.endsWith("-01");
  const left = shown;
  return (
    <div
      className={`group relative min-w-0 overflow-hidden border-l border-hairline px-1 pb-1 pt-1 first:border-l-0 ${isWeekend(day) ? "bg-surface-2/45" : ""}`}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a")) return;
        onCreate(day);
      }}
      title="Double-click for a new event"
    >
      <div className="mb-0.5 flex h-[24px] items-center justify-end gap-1 px-0.5">
        {first && !isToday && (
          <button onClick={() => onDay(day)} className="rounded-full bg-bad-soft px-2 py-[2px] text-[12px] font-semibold text-bad" aria-label={`Open ${day}`}>
            {monthStartLabel(day)}
          </button>
        )}
        {!(first && !isToday) && (
          <button
            onClick={() => onDay(day)}
            className={`num inline-flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-1 text-[13.5px] font-semibold hover:ring-1 hover:ring-hairline-strong ${
              isToday ? "bg-bad text-white" : out ? "font-medium text-ink-3" : "text-ink"
            }`}
            aria-label={`Open ${day}`}
          >
            {isToday && first ? monthStartLabel(day) : Number(day.slice(8))}
          </button>
        )}
      </div>
      <div className={`space-y-px ${out ? "opacity-60" : ""}`}>
        {items.slice(0, left).map((it) => {
          const e = it.event;
          if (e.allDay || (it.continued && it.end >= 1440))
            return (
              <button
                key={e.id}
                onClick={() => onOpen(e)}
                className={`block h-[18px] w-full truncate rounded-[4px] px-1.5 text-left text-[11.5px] font-medium leading-[18px] ${e.declined ? "opacity-55" : ""}`}
                style={{ background: e.color, color: textOn(e.color) }}
                title={e.title}
              >
                {e.title}
              </button>
            );
          return (
            <button
              key={e.id}
              onClick={() => onOpen(e)}
              className={`flex h-[18px] w-full min-w-0 items-center gap-1.5 rounded-[4px] px-1 text-left text-[11.5px] leading-[18px] hover:bg-surface-2 ${e.declined ? "opacity-55" : ""}`}
              title={`${e.title} · ${itemTime(it)}`}
            >
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: e.color }} />
              <span className={`min-w-0 flex-1 truncate font-medium ${e.declined ? "line-through" : ""}`}>{e.title}</span>
              <span className="num hidden shrink-0 text-[10.5px] text-ink-3 xl:inline">{formatClock(it.start)}</span>
            </button>
          );
        })}
        {dayTasks.slice(0, Math.max(0, left - items.length)).map((t) => (
          <div key={t.id} className="flex h-[18px] w-full min-w-0 items-center gap-1 rounded-[4px] px-1 text-[11.5px] hover:bg-surface-2">
            <TaskCheck task={t} size={11} />
            <button onClick={() => onOpenTask(t)} className={`min-w-0 flex-1 truncate text-left ${t.status === "done" ? "text-ink-3 line-through" : ""}`} style={{ color: t.status === "done" ? undefined : colorOf(t) }}>
              {t.title}
            </button>
            {t.scheduledStart && <span className="num hidden shrink-0 text-[10.5px] text-ink-3 xl:inline">{formatClock(minOf(t.scheduledStart, tz))}</span>}
          </div>
        ))}
        {more > 0 && (
          <button onClick={() => onDay(day)} className="block w-full truncate rounded-[4px] px-1 text-left text-[11px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
            {more} more…
          </button>
        )}
      </div>
    </div>
  );
}

const ymdOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const minOf = (iso: string, tz: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === "hour")?.value ?? 0) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
};

/* ------------------------------------------------------------- year grid */

/** Year view: twelve mini months with busy dots; a day opens the day view, a month name the month view. */
export function YearGrid({
  anchor,
  weekStart,
  today,
  tz,
  events,
  onDay,
  onMonth,
}: {
  anchor: string;
  weekStart: number;
  today: string;
  tz: string;
  events: EventDTO[];
  onDay: (day: string) => void;
  onMonth: (first: string) => void;
}) {
  const year = anchor.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const busy = useMemo(() => {
    const all = months.flatMap((m) => monthWeeks(m, weekStart).flat().filter((d) => d.slice(0, 7) === m.slice(0, 7)));
    return busyDays(events, all, tz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, year, weekStart, tz]);
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((m) => (
        <div key={m}>
          <button onClick={() => onMonth(m)} className={`mb-1.5 px-1 text-[15px] font-semibold tracking-[-0.01em] hover:underline ${m.slice(0, 7) === today.slice(0, 7) ? "text-bad" : ""}`}>
            {monthTitle(m).split(" ")[0]}
          </button>
          <div className="grid grid-cols-7 text-center">
            {weekdayLetters(weekStart).map((l, i) => (
              <div key={i} className="pb-1 text-[10px] font-medium text-ink-3">
                {l}
              </div>
            ))}
            {monthWeeks(m, weekStart, true)
              .flat()
              .map((day) => {
                const out = day.slice(0, 7) !== m.slice(0, 7);
                if (out) return <span key={day} className="h-[28px]" />;
                const n = busy.get(day) ?? 0;
                return (
                  <button key={day} onClick={() => onDay(day)} className="relative flex h-[28px] items-center justify-center" aria-label={`${day}${n ? `, ${n} events` : ""}`}>
                    <span
                      className={`num inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11.5px] ${
                        day === today ? "bg-bad font-semibold text-white" : n >= 3 ? "bg-accent/25 font-medium" : n ? "bg-accent/10" : isWeekend(day) ? "text-ink-3" : "text-ink-2"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- view switcher */

export function ViewSwitch<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="inline-flex rounded-[10px] bg-surface-2 p-[3px]" role="group" aria-label="View">
      {options.map(([v, label]) => (
        <button
          key={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded-[7px] px-2.5 py-[5px] text-[13px] font-medium transition-colors sm:px-3 ${value === v ? "bg-bad text-white shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Keeps a value in localStorage (per-viewer convenience). */
export function useStoredFlag(key: string, initial: boolean) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s !== null) setV(s === "1");
    } catch {
      /* private mode */
    }
  }, [key]);
  const set = (next: boolean) => {
    setV(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
  return [v, set] as const;
}

export { firstOfMonth };
