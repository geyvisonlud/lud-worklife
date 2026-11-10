"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Inbox, MapPin, Plus, RefreshCw, Video } from "lucide-react";
import { createEvent, createTask, scheduleTask, setCalendarVisible, syncCalendarsNow, syncIfStale } from "@/app/actions";
import { dragRange, hm } from "@/lib/events";
import { layoutDay, clipToDay } from "@/lib/calendar-layout";
import { projectColor } from "@/lib/colors";
import { addDays, dayShort, wallMinutes, formatClock, formatClockRange, formatDay, formatRange, minutesInTz, snapMinutes, ymdInTz, zonedToUtc } from "@/lib/dates";
import type { CalendarDTO, EventDTO, TaskDTO } from "@/lib/data";
import { compareTasks } from "@/lib/tasks";
import { dragState } from "./dragState";
import { Field, Sheet } from "./Sheet";
import { QuickAdd, TaskCheck, TaskRow } from "./TaskBits";
import { useReport, useWork } from "./TaskSheet";
import { GoogleMark } from "./ui";

const HOUR = 48; // px per hour
const PX_PER_MIN = HOUR / 60;

export type CalView = "day" | "3day" | "week";

type Block =
  | { kind: "event"; id: string; start: number; end: number; event: EventDTO }
  | { kind: "task"; id: string; start: number; end: number; task: TaskDTO };

export function CalendarView({
  days,
  view,
  anchor,
  events,
  tasks,
  calendars,
  hasAccounts,
  explicitView,
}: {
  days: string[];
  view: CalView;
  anchor: string;
  events: EventDTO[];
  tasks: TaskDTO[];
  calendars: CalendarDTO[];
  hasAccounts: boolean;
  explicitView: boolean;
}) {
  const { tz, today, projects, openTask, defaultDuration } = useWork();
  const report = useReport();
  const router = useRouter();
  const [local, setLocal] = useState(tasks);
  const [ghost, setGhost] = useState<{ day: string; start: number; duration: number } | null>(null);
  const [trayOver, setTrayOver] = useState(false);
  const [openEvent, setOpenEvent] = useState<EventDTO | null>(null);
  const [resizing, setResizing] = useState<{ id: string; duration: number } | null>(null);
  const [syncing, startSync] = useTransition();
  const [, start] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const [showTray, setShowTray] = useState(false);
  /** Live selection while dragging on an empty part of a day, and the "new event / task" sheet it opens. */
  const [draft, setDraft] = useState<{ day: string; start: number; end: number } | null>(null);
  const [create, setCreate] = useState<NewItem | null>(null);
  const pointerKind = useRef<string>("mouse");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => setLocal(tasks), [tasks]);

  // Phones open on the day view unless a view was picked.
  useEffect(() => {
    if (!explicitView && window.innerWidth < 768 && view === "week") router.replace(`/calendar?view=day&date=${anchor}`);
  }, [explicitView, view, anchor, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    syncIfStale().catch(() => {});
    return () => clearInterval(t);
  }, []);

  // Start scrolled to the morning (or an hour before now).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const m = days.includes(today) ? minutesInTz(new Date(), tz) - 90 : 7 * 60 + 30;
    el.scrollTop = Math.max(0, m * PX_PER_MIN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const colorOf = (t: TaskDTO) => projectColor(projects.find((p) => p.id === t.projectId)?.color).hex;

  /* ---------------------------------------------- what goes in each day */
  const perDay = useMemo(() => {
    return days.map((day) => {
      // Wall-clock minutes relative to this day's midnight (DST-safe: 10 AM is at 10 AM on change days too).
      const rel = (iso: string) => wallMinutes(new Date(iso), day, tz);
      const blocks: Block[] = [];
      const allDay: EventDTO[] = [];
      for (const e of events) {
        if (e.allDay) {
          const s = e.start.slice(0, 10);
          const en = e.end.slice(0, 10);
          if (s <= day && (day < en || s === en)) allDay.push(e);
          continue;
        }
        const c = clipToDay(rel(e.start), rel(e.end));
        if (c) blocks.push({ kind: "event", id: `e:${e.id}`, start: c.start, end: Math.max(c.end, c.start + 15), event: e });
      }
      for (const t of local) {
        if (!t.scheduledStart) continue;
        const s = rel(t.scheduledStart);
        const dur = resizing?.id === t.id ? resizing.duration : t.durationMin;
        const c = clipToDay(s, s + dur);
        if (c && s >= 0 && s < 1440) blocks.push({ kind: "task", id: `t:${t.id}`, start: c.start, end: c.end, task: t });
      }
      const due = local.filter((t) => !t.scheduledStart && t.status !== "done" && t.dueDate === day);
      const placed = layoutDay(blocks.map((b) => ({ id: b.id, start: b.start, end: b.end })));
      const byId = new Map(blocks.map((b) => [b.id, b]));
      return { day, allDay, due, blocks: placed.map((p) => ({ ...p, block: byId.get(p.id)! })) };
    });
  }, [days, events, local, tz, resizing]);

  const tray = useMemo(() => local.filter((t) => !t.scheduledStart && t.status !== "done").sort(compareTasks), [local]);

  /* ---------------------------------------------------------- scheduling */
  const commit = (id: string, startIso: string | null, durationMin?: number) => {
    const before = local;
    setLocal((ts) => ts.map((t) => (t.id === id ? { ...t, scheduledStart: startIso, ...(durationMin ? { durationMin } : {}) } : t)));
    start(async () => {
      if (!report(await scheduleTask(id, startIso, durationMin))) setLocal(before);
    });
  };

  const minuteAt = (e: React.DragEvent | React.MouseEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top;
    return y / PX_PER_MIN;
  };

  const onDayDragOver = (day: string) => (e: React.DragEvent<HTMLDivElement>) => {
    const d = dragState.task;
    if (!d) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const s = snapMinutes(minuteAt(e, e.currentTarget) - d.grab);
    if (ghost?.day !== day || ghost.start !== s) setGhost({ day, start: s, duration: d.durationMin });
  };
  const onDayDrop = (day: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const d = dragState.task;
    dragState.task = null;
    setGhost(null);
    if (!d) return;
    const s = snapMinutes(minuteAt(e, e.currentTarget) - d.grab);
    commit(d.id, zonedToUtc(day, s, tz).toISOString());
  };

  const startResize = (t: TaskDTO) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const y0 = e.clientY;
    const d0 = t.durationMin;
    let dur = d0;
    setResizing({ id: t.id, duration: d0 });
    const move = (ev: PointerEvent) => {
      dur = Math.max(15, Math.round((d0 + (ev.clientY - y0) / PX_PER_MIN) / 15) * 15);
      setResizing({ id: t.id, duration: dur });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(null);
      if (dur !== d0 && t.scheduledStart) commit(t.id, t.scheduledStart, dur);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ------------------------------------------- drag on the grid to create */
  const startSelect = (day: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    pointerKind.current = e.pointerType;
    // Touch scrolls the grid; a tap opens the sheet instead (onClick below).
    if (e.pointerType === "touch" || e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
    const el = e.currentTarget;
    const top = el.getBoundingClientRect().top;
    const from = (e.clientY - top) / PX_PER_MIN;
    let range = dragRange(from, from + 1);
    let moved = false;
    setDraft({ day, ...range });
    const move = (ev: PointerEvent) => {
      const to = (ev.clientY - el.getBoundingClientRect().top) / PX_PER_MIN;
      if (Math.abs(to - from) > 4) moved = true;
      range = dragRange(from, to);
      setDraft({ day, ...range });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null);
      // A click without dragging makes a one-hour slot starting at the half hour clicked.
      if (!moved) {
        const s = Math.min(23 * 60, Math.floor(from / 30) * 30);
        range = { start: s, end: s + 60 };
      }
      setCreate({ day, start: range.start, end: range.end, allDay: false });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* -------------------------------------------------------------- render */
  const step = view === "week" ? 7 : view === "3day" ? 3 : 1;
  const href = (date: string, v: CalView = view) => `/calendar?view=${v}&date=${date}`;
  const nowMin = minutesInTz(now, tz);
  const accounts = [...new Set(calendars.map((c) => c.accountEmail))];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* ---------- side panel */}
      <aside className="order-2 flex flex-col gap-4 lg:order-1 lg:w-[248px] lg:shrink-0">
        <section
          className={`card animate-in !p-0 transition-colors ${trayOver ? "!border-accent !bg-accent-soft" : ""}`}
          onDragOver={(e) => {
            const d = dragState.task;
            if (!d || !local.find((t) => t.id === d.id)?.scheduledStart) return;
            e.preventDefault();
            setTrayOver(true);
          }}
          onDragLeave={() => setTrayOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTrayOver(false);
            const d = dragState.task;
            dragState.task = null;
            if (d) commit(d.id, null);
          }}
        >
          <button className="flex w-full items-center gap-2 border-b border-hairline px-4 py-3 text-left lg:pointer-events-none" onClick={() => setShowTray((v) => !v)}>
            <Inbox size={14} className="text-ink-3" />
            <h2 className="label-mono">Unscheduled</h2>
            <span className="num ml-auto text-[12px] text-ink-3">{tray.length}</span>
          </button>
          <div className={`${showTray ? "block" : "hidden"} px-4 pb-3 pt-2 lg:block`}>
            <p className="mb-1 text-[12px] text-ink-3">Drag a task onto the calendar to block time for it. Drag it back here to unschedule.</p>
            <div className="max-h-[42vh] overflow-y-auto">
              {tray.map((t) => (
                <TaskRow key={t.id} task={t} draggable compact={false} />
              ))}
              {!tray.length && <p className="py-4 text-center text-[13px] text-ink-3">Everything is scheduled 🎉</p>}
            </div>
            <div className="mt-2">
              <QuickAdd placeholder="New task…" />
            </div>
          </div>
        </section>

        <section className="card animate-in !p-0">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <h2 className="label-mono">Calendars</h2>
            <Link href="/connections" className="ml-auto text-[12px] text-accent">
              Manage
            </Link>
          </div>
          <div className="space-y-3 px-4 py-3">
            {!hasAccounts && (
              <a href="/api/google/connect" className="btn btn-secondary w-full justify-center">
                <GoogleMark /> Connect Google Calendar
              </a>
            )}
            {accounts.map((email) => (
              <div key={email}>
                <div className="mb-1 truncate text-[11.5px] text-ink-3">{email}</div>
                {calendars
                  .filter((c) => c.accountEmail === email)
                  .map((c) => (
                    <CalendarToggle key={c.id} cal={c} />
                  ))}
              </div>
            ))}
          </div>
        </section>
      </aside>

      {/* ---------- grid */}
      <section className="card animate-in order-1 min-w-0 flex-1 !p-0 lg:order-2">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1">
            <Link href={href(addDays(anchor, -step))} className="icon-btn !h-8 !w-8" aria-label="Previous">
              <ChevronLeft size={16} />
            </Link>
            <Link href={href(today)} className="pill !py-1">
              Today
            </Link>
            <Link href={href(addDays(anchor, step))} className="icon-btn !h-8 !w-8" aria-label="Next">
              <ChevronRight size={16} />
            </Link>
          </div>
          <h2 className="text-[15px] font-medium tracking-[-0.01em]">{view === "day" ? formatDay(days[0], { long: true, year: true }) : formatRange(days[0], days[days.length - 1])}</h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn btn-primary !px-2.5 !py-1.5 !text-[13px]"
              onClick={() => {
                const d = days.includes(today) ? today : days[0];
                const s = d === today ? Math.min(23 * 60, Math.ceil(minutesInTz(new Date(), tz) / 30) * 30) : 9 * 60;
                setCreate({ day: d, start: s, end: Math.min(1440, s + 60), allDay: false });
              }}
            >
              <Plus size={14} /> New
            </button>
            <div className="seg-sm" role="group" aria-label="View">
              {(["day", "3day", "week"] as const).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => router.push(href(anchor, v))}>
                  {v === "day" ? "Day" : v === "3day" ? "3 days" : "Week"}
                </button>
              ))}
            </div>
            <button
              className="icon-btn !h-8 !w-8"
              aria-label="Sync calendars"
              disabled={syncing}
              onClick={() => startSync(async () => void report(await syncCalendarsNow()))}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: view === "week" ? 640 : undefined }}>
            {/* day headers + all-day row */}
            <div className="grid border-b border-hairline" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="flex items-end justify-end pb-1 pr-2 text-[10px] text-ink-3">{tzAbbr(tz)}</div>
              {perDay.map(({ day, allDay, due }) => {
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className="min-w-0 cursor-default border-l border-hairline px-1 pb-1.5 pt-2"
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,[draggable=true]")) return;
                      setCreate({ day, start: 9 * 60, end: 10 * 60, allDay: true });
                    }}
                    title="Double-click for an all-day event"
                  >
                    <div className="mb-1 flex items-baseline justify-center gap-1.5">
                      <span className={`label-mono !text-[10px] ${isToday ? "!text-accent" : ""}`}>{dayShort(day)}</span>
                      <span className={`num inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[16px] font-medium ${isToday ? "bg-accent text-white" : ""}`}>
                        {Number(day.slice(8))}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {allDay.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setOpenEvent(e)}
                          className="block w-full truncate rounded-[5px] px-1.5 py-[1px] text-left text-[11.5px] font-medium"
                          style={{ background: e.color, color: textOn(e.color) }}
                          title={e.title}
                        >
                          {e.title}
                        </button>
                      ))}
                      {due.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(ev) => {
                            dragState.task = { id: t.id, durationMin: t.durationMin, grab: 0 };
                            ev.dataTransfer.setData("text/plain", t.title);
                          }}
                          onDragEnd={() => (dragState.task = null)}
                          onClick={() => openTask(t)}
                          className="flex cursor-grab items-center gap-1 truncate rounded-[5px] border border-dashed px-1 py-[1px] text-[11.5px]"
                          style={{ borderColor: `color-mix(in srgb, ${colorOf(t)} 60%, transparent)` }}
                          title={`Due: ${t.title}`}
                        >
                          <TaskCheck task={t} size={11} />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* time grid */}
            <div ref={scroller} className="relative max-h-[calc(100vh-230px)] min-h-[420px] overflow-y-auto">
              <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR }}>
                <div className="relative">
                  {Array.from({ length: 23 }, (_, i) => (
                    <div key={i} className="num absolute right-2 -translate-y-1/2 text-[10.5px] text-ink-3" style={{ top: (i + 1) * HOUR }}>
                      {formatClock((i + 1) * 60)}
                    </div>
                  ))}
                </div>
                {perDay.map(({ day, blocks }) => (
                  <div
                    key={day}
                    className="relative border-l border-hairline"
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px ${HOUR}px)` }}
                    onDragOver={onDayDragOver(day)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost((g) => (g?.day === day ? null : g));
                    }}
                    onDrop={onDayDrop(day)}
                    onPointerDown={startSelect(day)}
                    onClick={(e) => {
                      // Mouse and pen are handled by the drag (startSelect); this is the tap on phones.
                      if (pointerKind.current !== "touch" || e.target !== e.currentTarget) return;
                      const s = Math.min(23 * 60, Math.floor(minuteAt(e, e.currentTarget) / 30) * 30);
                      setCreate({ day, start: s, end: s + 60, allDay: false });
                    }}
                  >
                    {blocks.map(({ id, start: s, end, col, cols, block }) => {
                      const style: React.CSSProperties = {
                        top: s * PX_PER_MIN + 1,
                        height: Math.max(18, (end - s) * PX_PER_MIN - 2),
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                      };
                      const short = end - s < 40;
                      if (block.kind === "event") {
                        const e = block.event;
                        return (
                          <button
                            key={id}
                            onClick={() => setOpenEvent(e)}
                            className={`absolute overflow-hidden rounded-[6px] px-1.5 text-left leading-tight transition-[filter] hover:brightness-[0.97] ${short ? "py-0" : "py-1"} ${e.declined ? "opacity-55" : ""}`}
                            style={{
                              ...style,
                              background: `color-mix(in srgb, ${e.color} 22%, var(--surface))`,
                              boxShadow: `inset 3px 0 0 ${e.color}`,
                              paddingLeft: 8,
                            }}
                            title={`${e.title} · ${formatClockRange(Math.round(s), Math.round(end))}`}
                          >
                            <div className={`truncate text-[11.5px] font-semibold ${e.declined ? "line-through" : ""}`}>
                              {e.title}
                              {short && <span className="font-normal text-ink-2"> · {formatClock(Math.round(s))}</span>}
                            </div>
                            {!short && <div className="num truncate text-[10.5px] text-ink-2">{formatClockRange(Math.round(s), Math.round(end))}</div>}
                            {!short && end - s >= 75 && e.location && <div className="truncate text-[10.5px] text-ink-2">{e.location}</div>}
                          </button>
                        );
                      }
                      const t = block.task;
                      const c = colorOf(t);
                      const done = t.status === "done";
                      return (
                        <div
                          key={id}
                          draggable={!resizing}
                          onDragStart={(ev) => {
                            const top = ev.currentTarget.getBoundingClientRect().top;
                            dragState.task = { id: t.id, durationMin: t.durationMin, grab: (ev.clientY - top) / PX_PER_MIN };
                            ev.dataTransfer.setData("text/plain", t.title);
                            ev.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            dragState.task = null;
                            setGhost(null);
                          }}
                          onClick={() => openTask(t)}
                          className={`group absolute cursor-grab overflow-hidden rounded-[6px] border-[1.5px] border-dashed px-1.5 leading-tight active:cursor-grabbing ${short ? "py-0" : "py-1"} ${done ? "opacity-60" : ""}`}
                          style={{ ...style, borderColor: `color-mix(in srgb, ${c} 65%, transparent)`, background: `color-mix(in srgb, ${c} 10%, var(--surface))` }}
                          title={`${t.title} · ${formatClockRange(Math.round(s), Math.round(end))}`}
                        >
                          <div className="flex items-start gap-1">
                            <span className="pt-[1px]">
                              <TaskCheck task={t} size={12} />
                            </span>
                            <div className="min-w-0">
                              <div className={`truncate text-[11.5px] font-medium ${done ? "line-through" : ""}`}>{t.title}</div>
                              {!short && <div className="num truncate text-[10.5px] text-ink-2">{formatClockRange(Math.round(s), Math.round(end))}</div>}
                            </div>
                          </div>
                          <div
                            onPointerDown={startResize(t)}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                            aria-label="Drag to change length"
                          >
                            <div className="mx-auto mt-0.5 h-[3px] w-6 rounded-full" style={{ background: c }} />
                          </div>
                        </div>
                      );
                    })}

                    {ghost?.day === day && (
                      <div
                        className="pointer-events-none absolute inset-x-0.5 rounded-[6px] border-2 border-accent bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"
                        style={{ top: ghost.start * PX_PER_MIN, height: Math.max(18, ghost.duration * PX_PER_MIN) }}
                      >
                        {formatClockRange(ghost.start, ghost.start + ghost.duration)}
                      </div>
                    )}

                    {(draft?.day === day || (create && !create.allDay && create.day === day)) && (
                      <div
                        className="pointer-events-none absolute inset-x-0.5 z-[5] rounded-[6px] border-2 border-accent bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"
                        style={{
                          top: (draft?.day === day ? draft.start : create!.start) * PX_PER_MIN,
                          height: Math.max(18, ((draft?.day === day ? draft.end - draft.start : create!.end - create!.start) || 60) * PX_PER_MIN),
                        }}
                      >
                        {draft?.day === day ? formatClockRange(draft.start, draft.end) : formatClockRange(create!.start, create!.end)}
                      </div>
                    )}

                    {day === today && (
                      <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: nowMin * PX_PER_MIN }} aria-hidden>
                        <div className="absolute -left-[5px] -top-[4.5px] h-[9px] w-[9px] rounded-full bg-bad" />
                        <div className="h-[2px] bg-bad" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <EventSheet event={openEvent} calendars={calendars} onClose={() => setOpenEvent(null)} tz={tz} />
      {create && <NewItemSheet key={`${create.day}-${create.start}-${create.allDay}`} item={create} calendars={calendars.filter((c) => c.canWrite)} onClose={() => setCreate(null)} />}
    </div>
  );
}

const textOn = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 165 ? "#151513" : "#fff";
};

function tzAbbr(tz: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function CalendarToggle({ cal }: { cal: CalendarDTO }) {
  const report = useReport();
  const [on, setOn] = useState(cal.visible);
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1 py-1 text-[13px] hover:bg-surface-2">
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        disabled={pending}
        onChange={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            if (!report(await setCalendarVisible(cal.id, next))) setOn(!next);
          });
        }}
      />
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px]"
        style={{ background: on ? cal.color : "transparent", boxShadow: `inset 0 0 0 2px ${cal.color}` }}
        aria-hidden
      >
        {on && (
          <svg viewBox="0 0 16 16" width="11" height="11">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke={textOn(cal.color)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={`truncate ${on ? "" : "text-ink-3"}`}>{cal.name}</span>
    </label>
  );
}

function EventSheet({ event, calendars, onClose, tz }: { event: EventDTO | null; calendars: CalendarDTO[]; onClose: () => void; tz: string }) {
  const cal = event ? calendars.find((c) => c.id === event.calendarId) : null;
  let when = "";
  if (event) {
    if (event.allDay) {
      const last = addDays(event.end.slice(0, 10), -1);
      when = last > event.start.slice(0, 10) ? `${formatDay(event.start.slice(0, 10))} – ${formatDay(last)}` : formatDay(event.start.slice(0, 10), { long: true });
    } else {
      const s = new Date(event.start);
      const e = new Date(event.end);
      when = `${formatDay(ymdInTz(s, tz), { long: true })} · ${formatClockRange(minutesInTz(s, tz), minutesInTz(e, tz) || 1440)}`;
    }
  }
  return (
    <Sheet open={Boolean(event)} onClose={onClose} title={event?.title ?? ""}>
      {event && (
        <div className="space-y-3 text-[14px]">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: event.color }} />
            <span>{when}</span>
          </div>
          {cal && (
            <div className="text-[13px] text-ink-2">
              {cal.name} · {cal.accountEmail}
            </div>
          )}
          {event.declined && <div className="text-[13px] text-warn">You declined this event.</div>}
          {event.location && (
            <div className="flex items-start gap-2 text-ink-2">
              <MapPin size={15} className="mt-0.5 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          {event.description && <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">{event.description.replace(/<[^>]+>/g, " ")}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {event.meetLink && (
              <a href={event.meetLink} target="_blank" rel="noreferrer" className="btn btn-primary">
                <Video size={14} /> Join meeting
              </a>
            )}
            {event.htmlLink && (
              <a href={event.htmlLink} target="_blank" rel="noreferrer" className="btn btn-secondary">
                Open in Google Calendar <ExternalLink size={12} className="text-ink-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

type NewItem = { day: string; start: number; end: number; allDay: boolean };
const LAST_CAL = "lw:last-calendar";

/** "New" from the calendar: an event (default) in one of your calendars, or a task with a time block. */
function NewItemSheet({ item, calendars, onClose }: { item: NewItem; calendars: CalendarDTO[]; onClose: () => void }) {
  const { tz, openTask } = useWork();
  const report = useReport();
  const router = useRouter();
  const [kind, setKind] = useState<"event" | "task">("event");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(item.day);
  const [allDay, setAllDay] = useState(item.allDay);
  const [endDay, setEndDay] = useState(item.day);
  const [start, setStart] = useState(hm(item.start));
  const [end, setEnd] = useState(hm(item.end));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [calendarId, setCalendarId] = useState(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_CAL);
    } catch {
      /* private mode */
    }
    return calendars.find((c) => c.id === last)?.id ?? calendars.find((c) => c.primary)?.id ?? calendars[0]?.id ?? "";
  });
  const [pending, startSave] = useTransition();
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const duration = (() => {
    const d = toMin(end) - toMin(start);
    return d > 0 ? d : d + 1440;
  })();

  const save = () =>
    startSave(async () => {
      if (kind === "event") {
        try {
          localStorage.setItem(LAST_CAL, calendarId);
        } catch {
          /* private mode */
        }
        const r = await createEvent({ calendarId, title, date: day, allDay, start, end, endDate: endDay, location, description: notes });
        if (report(r)) (onClose(), router.refresh());
      } else {
        const r = await createTask({
          title: title || "New task",
          notes: notes || null,
          ...(allDay ? { dueDate: day } : { scheduledStart: zonedToUtc(day, toMin(start), tz).toISOString(), durationMin: duration }),
        });
        if (report(r)) (onClose(), router.refresh());
      }
    });

  const cal = calendars.find((c) => c.id === calendarId);
  return (
    <Sheet open onClose={onClose} title={kind === "event" ? "New event" : "New task"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="seg-sm w-full" role="group" aria-label="Create">
          <button type="button" aria-pressed={kind === "event"} onClick={() => setKind("event")} className="flex-1">
            <CalendarPlus size={13} className="mr-1 inline" /> Event
          </button>
          <button type="button" aria-pressed={kind === "task"} onClick={() => setKind("task")} className="flex-1">
            <CheckCircle2 size={13} className="mr-1 inline" /> Task
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "event" ? "Event title" : "Task title"}
          aria-label="Title"
          className="input !text-[16px] font-medium"
          maxLength={300}
        />
        {kind === "event" &&
          (calendars.length ? (
            <Field label="Calendar">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ background: cal?.color }} />
                <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="input !pl-8 !text-[14px]">
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.accountEmail}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          ) : (
            <p className="text-[13px] text-bad">
              No calendar you can add events to — connect a Google account in{" "}
              <Link href="/connections" className="underline">
                Connections
              </Link>
              .
            </p>
          ))}
        <div className={`grid gap-3 ${allDay ? "grid-cols-2" : "sm:grid-cols-2"}`}>
          <Field label={allDay && kind === "event" ? "From" : "Day"}>
            <input type="date" required value={day} onChange={(e) => (setDay(e.target.value), endDay < e.target.value && setEndDay(e.target.value))} className="input !text-[14px]" />
          </Field>
          {allDay ? (
            kind === "event" ? (
              <Field label="To">
                <input type="date" value={endDay} min={day} onChange={(e) => setEndDay(e.target.value)} className="input !text-[14px]" />
              </Field>
            ) : (
              <div />
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="input !px-2 !text-[14px]" />
              </Field>
              <Field label="End">
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="input !px-2 !text-[14px]" />
              </Field>
            </div>
          )}
        </div>
        <label className="flex items-center justify-between gap-3 text-[14px]">
          <span>{kind === "event" ? "All day" : "No time block (just due that day)"}</span>
          <input type="checkbox" className="switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        </label>
        {kind === "event" && <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" className="input !text-[14px]" />}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "event" ? "Description" : "Notes"} aria-label="Notes" rows={2} className="input !text-[14px]" />
        <div className="flex items-center gap-2">
          <button className="btn btn-primary flex-1" disabled={pending || (kind === "event" && !calendarId)}>
            {pending ? "Saving…" : kind === "event" ? "Add event" : "Add task"}
          </button>
          {kind === "task" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onClose();
                openTask(null, allDay ? { dueDate: day } : { scheduledStart: zonedToUtc(day, toMin(start), tz).toISOString(), durationMin: duration });
              }}
            >
              More options
            </button>
          )}
        </div>
        {kind === "event" && cal && !allDay && (
          <p className="text-[12px] text-ink-3">
            {formatDay(day, { long: true })} · {formatClockRange(toMin(start), toMin(end))} · {cal.name}
          </p>
        )}
      </form>
    </Sheet>
  );
}
