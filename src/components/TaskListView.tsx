"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { reorderTask, scheduleTask, updateTask } from "@/app/actions";
import { layoutDay, clipToDay } from "@/lib/calendar-layout";
import { projectColor } from "@/lib/colors";
import { addDays, formatClock, formatClockRange, formatDay, minutesInTz, wallMinutes, ymdInTz, zonedToUtc } from "@/lib/dates";
import type { EventDTO, TaskDTO } from "@/lib/data";
import { positionBetween } from "@/lib/kanban";
import { listSections, minuteAtY, tagCounts, type ListGroup, type ListSort } from "@/lib/task-list";
import { flagDate } from "@/lib/tasks";
import { dragState } from "./dragState";
import { QuickAdd, TagChip, TaskCheck } from "./TaskBits";
import { useReport, useWork } from "./TaskSheet";

const PREFS = "lw:task-list";

/**
 * Tasks → List, Things-style: quick add on top, one column of open tasks divided by project (or not), sorted by date,
 * priority or the manual order, filtered by tag — and the day's agenda on the right: drag a task onto an hour to block
 * time for it (written to Google Calendar too when a calendar is chosen for time blocks on Connections).
 */
export function TaskListView({ tasks, events, day, hrefBase }: { tasks: TaskDTO[]; events: EventDTO[]; day: string; hrefBase: string }) {
  const { projects, tz, today, openTask } = useWork();
  const dayHref = (d: string) => (d === today ? hrefBase : `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}day=${d}`);
  const report = useReport();
  const [local, setLocal] = useState(tasks);
  useEffect(() => setLocal(tasks), [tasks]);
  const [group, setGroup] = useState<ListGroup>("project");
  const [sort, setSort] = useState<ListSort>("manual");
  const [tag, setTag] = useState<string | null>(null);
  // Remember grouping and sort per device.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? "null");
      if (p?.group) setGroup(p.group);
      if (p?.sort) setSort(p.sort);
    } catch {
      /* private mode */
    }
  }, []);
  const savePrefs = (g: ListGroup, s: ListSort) => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ group: g, sort: s }));
    } catch {
      /* private mode */
    }
  };
  const [, start] = useTransition();
  const dayOfInstant = (iso: string) => ymdInTz(new Date(iso), tz);
  const sections = useMemo(() => listSections(local, projects, { group, sort, tag, dayOfInstant }), [local, projects, group, sort, tag, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => tagCounts(local), [local]);
  const open = local.filter((t) => t.status !== "done").length;

  /* ------------------------------------------------ moves (optimistic) */
  const patch = (id: string, p: Partial<TaskDTO>) => setLocal((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const schedule = (id: string, iso: string | null) => {
    const before = local;
    patch(id, { scheduledStart: iso });
    start(async () => {
      if (!report(await scheduleTask(id, iso))) setLocal(before);
    });
  };
  /** Drop in the list (manual order): between neighbours of the target section; another project's section moves it there. */
  const [over, setOver] = useState<{ section: string; index: number } | null>(null);
  const dropInList = (sectionKey: string, index: number) => {
    const d = dragState.task;
    dragState.task = null;
    setOver(null);
    if (!d) return;
    const section = sections.find((s) => s.key === sectionKey);
    const moved = local.find((t) => t.id === d.id);
    if (!section || !moved) return;
    const others = section.tasks.filter((t) => t.id !== d.id);
    const i = Math.max(0, Math.min(others.length, index));
    const position = positionBetween(others[i - 1]?.position, others[i]?.position);
    const projectId = group === "project" ? (sectionKey === "inbox" ? null : sectionKey) : moved.projectId;
    if (projectId === moved.projectId && position === moved.position) return;
    const before = local;
    patch(d.id, { position, projectId });
    start(async () => {
      if (projectId !== moved.projectId && !report(await updateTask(d.id, { projectId }))) return setLocal(before);
      if (!report(await reorderTask(d.id, position))) setLocal(before);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="mx-auto w-full min-w-0 max-w-[760px]">
        <div className="animate-in">
          <QuickAdd placeholder="New task — try “Call João tomorrow #church !high 30m”" />
        </div>
        <div className="animate-in mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <Seg
            label="Group"
            value={group}
            options={[
              ["project", "Projects"],
              ["none", "None"],
            ]}
            onChange={(v) => (setGroup(v as ListGroup), savePrefs(v as ListGroup, sort))}
          />
          <Seg
            label="Sort"
            value={sort}
            options={[
              ["manual", "Manual"],
              ["date", "Date"],
              ["priority", "Priority"],
            ]}
            onChange={(v) => (setSort(v as ListSort), savePrefs(group, v as ListSort))}
          />
          <span className="num ml-auto text-ink-3">{open} open</span>
        </div>
        {tags.length > 0 && (
          <div className="animate-in mt-2 flex flex-wrap gap-1.5">
            {tags.map(({ tag: t, count }) => (
              <span key={t} className="inline-flex items-center gap-1">
                <TagChip tag={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)} />
                <span className="num text-[11px] text-ink-3">{count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 space-y-7">
          {sections.map((s) => {
            const c = s.project ? projectColor(s.project.color).hex : null;
            return (
              <section
                key={s.key}
                className="animate-in"
                onDragOver={(e) => {
                  if (!dragState.task || sort !== "manual") return;
                  e.preventDefault();
                  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")].filter((r) => r.dataset.row !== dragState.task?.id);
                  const idx = rows.findIndex((r) => {
                    const b = r.getBoundingClientRect();
                    return e.clientY < b.top + b.height / 2;
                  });
                  const index = idx === -1 ? rows.length : idx;
                  if (over?.section !== s.key || over.index !== index) setOver({ section: s.key, index });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.section === s.key ? null : o));
                }}
                onDrop={(e) => {
                  if (sort !== "manual") return;
                  e.preventDefault();
                  dropInList(s.key, over?.section === s.key ? over.index : s.tasks.length);
                }}
              >
                {group === "project" && (
                  <h2 className="mb-1 flex items-center gap-2 border-b border-hairline pb-1.5">
                    {s.project ? (
                      s.project.emoji ? (
                        <span className="text-[15px] leading-none">{s.project.emoji}</span>
                      ) : (
                        <span className="h-3 w-3 rounded-full" style={{ background: c ?? undefined }} />
                      )
                    ) : null}
                    {s.project ? (
                      <Link href={`/projects/${s.project.id}`} className="text-[15px] font-semibold tracking-[-0.01em] hover:underline" style={{ color: c ? `color-mix(in srgb, ${c} 75%, var(--ink))` : undefined }}>
                        {s.title}
                      </Link>
                    ) : (
                      <span className="text-[15px] font-semibold tracking-[-0.01em]">{s.title}</span>
                    )}
                    <span className="num text-[12px] text-ink-3">{s.tasks.length}</span>
                  </h2>
                )}
                <div>
                  {s.tasks.map((t, i) => (
                    <div key={t.id}>
                      {over?.section === s.key && over.index === i && <DropLine />}
                      <ListRow
                        task={t}
                        showProject={group === "none"}
                        today={today}
                        dayOfInstant={dayOfInstant}
                        onOpen={() => openTask(t)}
                        draggable
                      />
                    </div>
                  ))}
                  {over?.section === s.key && over.index >= s.tasks.filter((x) => x.id !== dragState.task?.id).length && <DropLine />}
                </div>
              </section>
            );
          })}
          {!sections.length && <p className="py-12 text-center text-[14px] text-ink-2">{tag ? `Nothing open with #${tag}.` : "All clear — nothing open. 🎉"}</p>}
        </div>
      </div>

      <DayAgenda day={day} events={events} tasks={local} dayHref={dayHref} onSchedule={schedule} onOpenTask={openTask} />
    </div>
  );
}

const DropLine = () => <div className="mx-1 my-0.5 h-[3px] rounded-full bg-accent" aria-hidden />;

function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink-3">{label}</span>
      <span className="inline-flex rounded-[9px] bg-surface-2 p-[2px]" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`rounded-[7px] px-2 py-[3px] font-medium ${value === v ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </span>
    </span>
  );
}

/** A row: checkbox, title (+ project when not grouped), tags, attachments, time block and due flag. Draggable. */
function ListRow({
  task: t,
  showProject,
  today,
  dayOfInstant,
  onOpen,
  draggable,
}: {
  task: TaskDTO;
  showProject: boolean;
  today: string;
  dayOfInstant: (iso: string) => string;
  onOpen: () => void;
  draggable: boolean;
}) {
  const { projects, tz } = useWork();
  const p = showProject && t.projectId ? projects.find((x) => x.id === t.projectId) : null;
  const overdue = t.dueDate && t.dueDate < today;
  const blockDay = t.scheduledStart ? dayOfInstant(t.scheduledStart) : null;
  return (
    <div
      data-row={t.id}
      data-task
      draggable={draggable}
      onDragStart={(e) => {
        dragState.task = { id: t.id, durationMin: t.durationMin, grab: 0 };
        e.dataTransfer.setData("text/plain", t.title);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => (dragState.task = null)}
      className="group flex cursor-grab items-start gap-3 rounded-[10px] px-2 py-[7px] hover:bg-surface-2/70 active:cursor-grabbing"
    >
      <span className="pt-[2px]">
        <TaskCheck task={t} size={17} />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="task-title text-[14.5px] leading-[1.4]">{t.title}</span>
        {(p || t.notes) && (
          <span className="block truncate text-[12px] text-ink-3">
            {p && (
              <span style={{ color: `color-mix(in srgb, ${projectColor(p.color).hex} 75%, var(--ink))` }}>
                {p.emoji ? `${p.emoji} ` : ""}
                {p.name}
              </span>
            )}
            {p && t.notes ? " · " : ""}
            {t.notes?.split("\n")[0]}
          </span>
        )}
      </button>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-[2px] text-[12px]">
        {t.tags.map((tag) => (
          <TagChip key={tag} tag={tag} />
        ))}
        {t.attachments > 0 && (
          <span className="num inline-flex items-center gap-0.5 text-ink-3">
            <Paperclip size={11} /> {t.attachments}
          </span>
        )}
        {t.scheduledStart && blockDay && (
          <span className="num inline-flex items-center gap-1 text-accent" title="Time block">
            <CalendarClock size={12} />
            {blockDay === today ? "" : `${flagDate(blockDay, today)} · `}
            {formatClock(minutesInTz(new Date(t.scheduledStart), tz))}
          </span>
        )}
        {t.dueDate && <span className={`num ${overdue ? "font-medium text-bad" : t.dueDate === today ? "font-medium text-warn" : "text-ink-3"}`}>{flagDate(t.dueDate, today)}</span>}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ day agenda */

const START_HOUR = 6;
const PX = 46; // per hour

/** The day as a time grid: events and time blocks; drop a task on an hour to block time for it. */
export function DayAgenda({
  day,
  events,
  tasks,
  dayHref,
  onSchedule,
  onOpenTask,
}: {
  day: string;
  events: EventDTO[];
  tasks: TaskDTO[];
  dayHref: (d: string) => string;
  onSchedule: (id: string, iso: string | null) => void;
  onOpenTask: (t: TaskDTO) => void;
}) {
  const { tz, today, googleTarget } = useWork();
  const [ghost, setGhost] = useState<{ start: number; duration: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const m = day === today ? minutesInTz(new Date(), tz) - 60 : 8 * 60;
    el.scrollTop = Math.max(0, ((m - START_HOUR * 60) / 60) * PX);
  }, [day, today, tz]);

  const rel = (iso: string) => wallMinutes(new Date(iso), day, tz);
  const allDay = events.filter((e) => e.allDay && e.start.slice(0, 10) <= day && (day < e.end.slice(0, 10) || e.start.slice(0, 10) === e.end.slice(0, 10)));
  type B = { id: string; start: number; end: number; ev?: EventDTO; task?: TaskDTO };
  const blocks: B[] = [];
  for (const e of events) {
    if (e.allDay) continue;
    const c = clipToDay(rel(e.start), rel(e.end));
    if (c) blocks.push({ id: `e:${e.id}`, start: c.start, end: Math.max(c.end, c.start + 15), ev: e });
  }
  for (const t of tasks) {
    if (!t.scheduledStart || t.status === "done") continue;
    const s = rel(t.scheduledStart);
    const c = clipToDay(s, s + t.durationMin);
    if (c && s >= 0 && s < 1440) blocks.push({ id: `t:${t.id}`, start: c.start, end: c.end, task: t });
  }
  const placed = layoutDay(blocks.map(({ id, start, end }) => ({ id, start, end })));
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const top = (min: number) => ((min - START_HOUR * 60) / 60) * PX;
  const nowMin = minutesInTz(now, tz);

  const at = (e: React.DragEvent) => {
    const r = grid.current!.getBoundingClientRect();
    return minuteAtY(e.clientY - r.top, PX, START_HOUR, dragState.task?.durationMin ?? 30);
  };

  return (
    <aside className="hidden lg:block">
      <div className="card animate-in sticky top-6 !p-0">
        <div className="flex items-center gap-1 border-b border-hairline px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className={`text-[11px] font-bold uppercase tracking-[0.06em] ${day === today ? "text-bad" : "text-ink-3"}`}>{day === today ? "Today" : formatDay(day).split(",")[0]}</div>
            <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{formatDay(day, { long: true })}</div>
          </div>
          <Link href={dayHref(addDays(day, -1))} className="icon-btn !h-7 !w-7" aria-label="Previous day" scroll={false}>
            <ChevronLeft size={15} />
          </Link>
          {day !== today && (
            <Link href={dayHref(today)} className="pill !px-2 !py-0.5 !text-[12px]" scroll={false}>
              Today
            </Link>
          )}
          <Link href={dayHref(addDays(day, 1))} className="icon-btn !h-7 !w-7" aria-label="Next day" scroll={false}>
            <ChevronRight size={15} />
          </Link>
        </div>
        {allDay.length > 0 && (
          <div className="space-y-0.5 border-b border-hairline px-3 py-2">
            {allDay.map((e) => (
              <div key={e.id} className="truncate rounded-[5px] px-1.5 py-[1px] text-[12px] font-medium" style={{ background: `color-mix(in srgb, ${e.color} 22%, var(--surface))` }}>
                {e.title}
              </div>
            ))}
          </div>
        )}
        <div ref={scroller} className="max-h-[calc(100vh-220px)] overflow-y-auto">
          <div
            ref={grid}
            className="relative ml-11 mr-2"
            style={{ height: (24 - START_HOUR) * PX, backgroundImage: `repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px ${PX}px)` }}
            onDragOver={(e) => {
              if (!dragState.task) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const s = at(e);
              if (ghost?.start !== s) setGhost({ start: s, duration: dragState.task.durationMin });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setGhost(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const d = dragState.task;
              dragState.task = null;
              setGhost(null);
              if (d) onSchedule(d.id, zonedToUtc(day, at(e), tz).toISOString());
            }}
          >
            {Array.from({ length: 24 - START_HOUR }, (_, i) => (
              <div key={i} className="num absolute -left-11 w-9 -translate-y-1/2 text-right text-[10.5px] text-ink-3" style={{ top: i * PX }}>
                {i ? formatClock((START_HOUR + i) * 60) : ""}
              </div>
            ))}
            {placed.map(({ id, start: s, end, col, cols }) => {
              const b = byId.get(id)!;
              const style: React.CSSProperties = {
                top: top(s) + 1,
                height: Math.max(18, ((end - s) / 60) * PX - 2),
                left: `calc(${(col / cols) * 100}% + 1px)`,
                width: `calc(${100 / cols}% - 2px)`,
              };
              const short = end - s < 40;
              if (b.ev) {
                const e = b.ev;
                return (
                  <div
                    key={id}
                    className={`absolute overflow-hidden rounded-[6px] px-1.5 leading-tight ${short ? "py-0" : "py-1"} ${e.declined ? "opacity-55" : ""}`}
                    style={{ ...style, background: `color-mix(in srgb, ${e.color} 20%, var(--surface))`, boxShadow: `inset 3px 0 0 ${e.color}`, paddingLeft: 7 }}
                    title={`${e.title} · ${formatClockRange(Math.round(s), Math.round(end))}`}
                  >
                    <div className="truncate text-[11.5px] font-semibold">{e.title}</div>
                    {!short && <div className="num truncate text-[10.5px] text-ink-2">{formatClockRange(Math.round(s), Math.round(end))}</div>}
                  </div>
                );
              }
              const t = b.task!;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(ev) => {
                    const r = ev.currentTarget.getBoundingClientRect();
                    dragState.task = { id: t.id, durationMin: t.durationMin, grab: (ev.clientY - r.top) / (PX / 60) };
                    ev.dataTransfer.setData("text/plain", t.title);
                  }}
                  onDragEnd={() => ((dragState.task = null), setGhost(null))}
                  onClick={() => onOpenTask(t)}
                  className="absolute cursor-grab overflow-hidden rounded-[6px] border-[1.5px] border-dashed border-accent/60 bg-accent-soft px-1.5 leading-tight active:cursor-grabbing"
                  style={style}
                  title={`${t.title} · ${formatClockRange(Math.round(s), Math.round(end))}`}
                >
                  <div className="truncate text-[11.5px] font-medium">{t.title}</div>
                  {!short && <div className="num truncate text-[10.5px] text-ink-2">{formatClockRange(Math.round(s), Math.round(end))}</div>}
                </div>
              );
            })}
            {ghost && (
              <div
                className="pointer-events-none absolute inset-x-0.5 rounded-[6px] border-2 border-accent bg-accent-soft px-1.5 text-[11px] font-medium text-accent"
                style={{ top: top(ghost.start), height: Math.max(18, (ghost.duration / 60) * PX) }}
              >
                {formatClockRange(ghost.start, ghost.start + ghost.duration)}
              </div>
            )}
            {day === today && nowMin >= START_HOUR * 60 && (
              <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: top(nowMin) }} aria-hidden>
                <div className="absolute -left-[5px] -top-[4.5px] h-[9px] w-[9px] rounded-full bg-bad" />
                <div className="h-[2px] bg-bad" />
              </div>
            )}
          </div>
        </div>
        <p className="border-t border-hairline px-3 py-2 text-[11.5px] text-ink-3">
          Drag a task onto an hour to block time for it{googleTarget ? ` — it’s added to ${googleTarget} in Google too.` : ". Pick a Google calendar for time blocks on Connections to add them to Google too."}
        </p>
      </div>
    </aside>
  );
}
