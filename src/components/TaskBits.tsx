"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, Clock, Flag, GripVertical, Paperclip, Plus } from "lucide-react";
import { archiveTasks, createTask, reorderTask, toggleTask } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { formatClock, formatDuration, minutesInTz, relativeDay, ymdInTz, daysBetween } from "@/lib/dates";
import type { TaskDTO } from "@/lib/data";
import { bucketOf, dropTask, parseQuickAdd, taskDay } from "@/lib/tasks";
import { dragState } from "./dragState";
import { useReport, useWork } from "./TaskSheet";
import { GoogleMark, NotionMark } from "./ui";

/** Fired on window after a task is added or checked here, so side panels refresh right away. */
export const TASKS_CHANGED = "lw:tasks-changed";
const tasksChanged = () => window.dispatchEvent(new Event(TASKS_CHANGED));

export const PRIORITY_COLOR = ["var(--ink-3)", "var(--c1)", "var(--warn)", "var(--bad)"];

/**
 * Round checkbox; ring color = priority. Optimistic. Checking it plays a short "done" animation (fill pop, ring burst,
 * the check drawing itself, the title striking through — see `.task-check` / `.task-title` in globals.css) and saves
 * once it has played, so the row doesn't jump away mid-animation.
 */
export function TaskCheck({ task, size = 18 }: { task: TaskDTO; size?: number }) {
  const report = useReport();
  const [checked, setChecked] = useState(task.status === "done");
  const [burst, setBurst] = useState(0);
  const [, start] = useTransition();
  useEffect(() => setChecked(task.status === "done"), [task.status]);
  const color = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[0];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
      onClick={(e) => {
        e.stopPropagation();
        const next = !checked;
        setChecked(next);
        if (next) {
          setBurst((b) => b + 1);
          try {
            navigator.vibrate?.(12);
          } catch {
            /* not supported */
          }
        }
        // Let the animation play before the list refreshes (and the task moves to Done).
        setTimeout(
          () =>
            start(async () => {
              if (!report(await toggleTask(task.id, next))) setChecked(!next);
              else tasksChanged();
            }),
          next ? 520 : 0,
        );
      }}
      className="task-check group/check relative inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,background-color,box-shadow] duration-200 active:scale-90"
      data-burst={burst || undefined}
      style={{
        width: size,
        height: size,
        boxShadow: `inset 0 0 0 1.6px ${checked ? "var(--good)" : color}`,
        background: checked ? "var(--good)" : task.priority >= 2 ? `color-mix(in srgb, ${color} 10%, transparent)` : "transparent",
      }}
    >
      {burst > 0 && checked && <span key={burst} className="task-check-ring pointer-events-none absolute inset-0 rounded-full" aria-hidden />}
      <svg key={checked ? `on-${burst}` : "off"} viewBox="0 0 16 16" width={size * 0.6} height={size * 0.6} className={checked ? `text-white ${burst ? "task-check-draw" : ""}` : "text-ink-3 opacity-0 group-hover/check:opacity-100"} aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      </svg>
    </button>
  );
}

/** Small meta line: project · due · time block · duration · Notion. */
export function TaskMeta({ task, showProject = true, inline = false }: { task: TaskDTO; showProject?: boolean; inline?: boolean }) {
  const { tz, today, projects } = useWork();
  const project = showProject && task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const sched = task.scheduledStart ? new Date(task.scheduledStart) : null;
  const overdue = task.status !== "done" && task.dueDate && daysBetween(today, task.dueDate) < 0;
  const bits: React.ReactNode[] = [];
  if (project)
    bits.push(
      <span key="p" className="inline-flex min-w-0 items-center gap-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: projectColor(project.color).hex }} />
        <span className="truncate">{project.name}</span>
      </span>,
    );
  if (sched) {
    const d = ymdInTz(sched, tz);
    bits.push(
      <span key="s" className="inline-flex items-center gap-1 whitespace-nowrap text-accent">
        <CalendarClock size={11} />
        {d === today ? "" : `${relativeDay(d, today)} `}
        {formatClock(minutesInTz(sched, tz))}
      </span>,
    );
  }
  if (task.dueDate)
    bits.push(
      <span key="d" className={`inline-flex items-center gap-1 whitespace-nowrap ${overdue ? "font-medium text-bad" : ""}`}>
        <Flag size={10} />
        {relativeDay(task.dueDate, today)}
      </span>,
    );
  if (task.durationMin && (sched || task.durationMin !== 30))
    bits.push(
      <span key="m" className="inline-flex items-center gap-1 whitespace-nowrap">
        <Clock size={10} />
        {formatDuration(task.durationMin)}
      </span>,
    );
  if (task.fromNotion) bits.push(<NotionMark key="n" size={11} />);
  for (const t of task.tags ?? []) bits.push(<TagChip key={`#${t}`} tag={t} />);
  if (task.attachments)
    bits.push(
      <span key="a" className="inline-flex items-center gap-0.5" title={`${task.attachments} attachment${task.attachments === 1 ? "" : "s"}`}>
        <Paperclip size={11} /> {task.attachments}
      </span>,
    );
  if (task.fromGoogleTasks)
    bits.push(
      <span key="g" className="inline-flex items-center" title="Synced with Google Tasks">
        <GoogleMark size={11} />
      </span>,
    );
  if (inline && task.priority > 0) bits.push(<PriorityBars key="pr" level={task.priority} />);
  if (!bits.length) return null;
  return <div className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-2 ${inline ? "mt-0.5 md:mt-0 md:justify-end" : "mt-0.5"}`}>{bits}</div>;
}

/** Priority as signal bars (1–3 filled), in the priority's color. */
export function PriorityBars({ level }: { level: number }) {
  const color = PRIORITY_COLOR[level] ?? PRIORITY_COLOR[0];
  const label = ["No priority", "Low priority", "Medium priority", "High priority"][level] ?? "";
  return (
    <span className="inline-flex h-3 items-end gap-[1.5px]" title={label} aria-label={label}>
      {[1, 2, 3].map((b) => (
        <span key={b} className="w-[3px] rounded-[1px]" style={{ height: 3 + b * 3, background: b <= level ? color : "var(--surface-3)" }} />
      ))}
    </span>
  );
}

/** A task in a list. `draggable` lets it be dropped on the calendar. */
export function TaskRow({
  task,
  showProject = true,
  draggable = false,
  compact = false,
  handle,
  inline = false,
}: {
  task: TaskDTO;
  showProject?: boolean;
  draggable?: boolean;
  compact?: boolean;
  /** Wide rows: details on the right of the title (md+), like a workspace task list. */
  inline?: boolean;
  /** Grip for reordering (SortableTasks). */
  handle?: React.ReactNode;
}) {
  const { openTask } = useWork();
  const done = task.status === "done";
  return (
    <div
      data-task
      className={`list-row group flex items-start gap-3 ${compact ? "py-2" : "py-2.5"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              dragState.task = { id: task.id, durationMin: task.durationMin, grab: 0 };
              e.dataTransfer.setData("text/plain", task.title);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onDragEnd={draggable ? () => (dragState.task = null) : undefined}
    >
      {handle}
      <div className="pt-[1px]">
        <TaskCheck task={task} />
      </div>
      <button type="button" onClick={() => openTask(task)} className={`min-w-0 flex-1 text-left ${inline ? "md:flex md:items-center md:gap-4" : ""}`}>
        <div className={`truncate text-[14.5px] leading-[1.35] ${inline ? "md:min-w-0 md:flex-1" : ""}`}>
          <span className="task-title">{task.title}</span>
        </div>
        {!compact && <TaskMeta task={task} showProject={showProject} inline={inline} />}
      </button>
    </div>
  );
}

/** "Add a task…" with natural shortcuts: today / tomorrow / 2026-12-01, !high, 45m / 1.5h. */
export function QuickAdd({ projectId, status, placeholder = "Add a task…", dueToday = false }: { projectId?: string | null; status?: string; placeholder?: string; dueToday?: boolean }) {
  const { today } = useWork();
  const report = useReport();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseQuickAdd(value, today);
    if (!q.title) return;
    // Clear right away and keep the cursor here, so Enter goes straight on to the next task (list building).
    const typed = value;
    setValue("");
    area.current?.focus();
    start(async () => {
      const r = await createTask({
        title: q.title,
        projectId: projectId ?? null,
        status,
        priority: q.priority,
        dueDate: q.dueDate ?? (dueToday ? today : null),
        tags: q.tags,
        ...(q.durationMin ? { durationMin: q.durationMin } : {}),
      });
      if (!report(r)) setValue((v) => v || typed);
      else tasksChanged();
    });
  };
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => grow(area.current), [value]);
  // The field grows with what you type (long titles wrap instead of scrolling out of view).
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  return (
    <form onSubmit={submit} className="rounded-[11px] border border-dashed border-[var(--hairline-strong)] px-3 py-1.5 focus-within:border-solid focus-within:border-accent">
      <div className="flex items-start gap-2">
        <Plus size={16} className="mt-[7px] shrink-0 text-ink-3" />
        <textarea
          ref={area}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\n/g, " "));
            grow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
            if (e.key === "Escape") setValue("");
          }}
          placeholder={placeholder}
          aria-label="New task"
          className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1 text-[14.5px] leading-[1.4] outline-none placeholder:text-ink-3"
          style={{ boxShadow: "none" }}
          enterKeyHint="next"
        />
      </div>
      {(value || pending) && (
        <div className="pb-0.5 pl-6 text-[11px] text-ink-3">{pending && !value ? "Adding…" : "Enter to add and start the next one · today · tomorrow · !high · 45m"}</div>
      )}
    </form>
  );
}

export function NewTaskButton({ projectId, label = "New task" }: { projectId?: string; label?: string }) {
  const { openTask } = useWork();
  return (
    <button className="btn btn-primary" onClick={() => openTask(null, projectId ? { projectId } : {})}>
      <Plus size={15} /> {label}
    </button>
  );
}

/** "Archive" for a list of done tasks (the list view's Done card). */
export function ArchiveDoneButton({ ids }: { ids: string[] }) {
  const report = useReport();
  const [pending, start] = useTransition();
  return (
    <button className="text-[12px] text-ink-2 hover:text-ink" disabled={pending} onClick={() => start(async () => void report(await archiveTasks(ids)))}>
      Archive all
    </button>
  );
}

/**
 * A task list you can reorder by dragging the grip (mouse or touch). Rows slide out of the way while dragging; the
 * drop saves the new manual position (`dropTask`). `group`: "focus" (overdue + today: dropping an overdue task among
 * today's makes it due today), "upcoming" (dropping on another day's tasks moves it to that day) or none.
 * Tasks with a time block are ordered by time and have no grip.
 */
export function SortableTasks({
  tasks,
  showProject = true,
  compact = false,
  group,
  inline = false,
}: {
  tasks: TaskDTO[];
  showProject?: boolean;
  compact?: boolean;
  group?: "focus" | "upcoming";
  inline?: boolean;
}) {
  const { today, tz } = useWork();
  const report = useReport();
  const [order, setOrder] = useState(tasks);
  const [drag, setDrag] = useState<{ id: string; from: number; dy: number; to: number; h: number } | null>(null);
  const rows = useRef<Map<string, HTMLDivElement>>(new Map());
  const [, start] = useTransition();
  useEffect(() => setOrder(tasks), [tasks]);

  const opts =
    group === "focus"
      ? { key: (t: TaskDTO) => bucketOf(t, today, tz), dateOf: (k: string) => (k === "today" ? today : null) }
      : group === "upcoming"
        ? { key: (t: TaskDTO) => taskDay(t, tz) ?? "", dateOf: (k: string) => k || null }
        : {};

  const begin = (id: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const from = order.findIndex((t) => t.id === id);
    const mids = order.map((t) => {
      const r = rows.current.get(t.id)?.getBoundingClientRect();
      return r ? r.top + r.height / 2 : 0;
    });
    const h = rows.current.get(id)?.getBoundingClientRect().height ?? 40;
    const y0 = e.clientY;
    let to = from;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, from, dy: 0, to, h });
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const mid = mids[from] + dy;
      // Index among the other rows = how many of them sit above the dragged row's middle.
      to = mids.filter((m, k) => k !== from && m < mid).length;
      setDrag({ id, from, dy, to, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDrag(null);
      const res = dropTask(order, id, to >= from ? to + 1 : to, opts);
      if (!res) return;
      const before = order;
      const moved = { ...order[from], position: res.position, ...(res.dueDate ? { dueDate: res.dueDate } : {}) };
      const next = order.filter((t) => t.id !== id);
      next.splice(to, 0, moved);
      setOrder(next);
      start(async () => {
        if (!report(await reorderTask(id, res.position, res.dueDate))) setOrder(before);
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div className={drag ? "select-none" : ""}>
      {order.map((t, k) => {
        const dragging = drag?.id === t.id;
        // Rows between where the dragged one was and where it would go slide by its height.
        const shift = !drag || dragging ? 0 : drag.from < k && k <= drag.to ? -drag.h : drag.to <= k && k < drag.from ? drag.h : 0;
        return (
          <div
            key={t.id}
            ref={(el) => {
              if (el) rows.current.set(t.id, el);
              else rows.current.delete(t.id);
            }}
            className={`relative ${dragging ? "z-10 rounded-[10px] bg-surface shadow-[var(--shadow-lift)]" : ""}`}
            style={{
              transform: dragging ? `translateY(${drag.dy}px) scale(1.01)` : shift ? `translateY(${shift}px)` : undefined,
              transition: dragging ? "box-shadow .15s" : drag ? "transform .18s ease" : undefined,
            }}
          >
            <TaskRow
              task={t}
              showProject={showProject}
              compact={compact}
              inline={inline}
              handle={
                t.scheduledStart ? (
                  <span className="-ml-1.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <button
                    type="button"
                    onPointerDown={begin(t.id)}
                    className="-ml-1.5 mt-[2px] flex h-5 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-3 opacity-0 transition-opacity hover:text-ink active:cursor-grabbing group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                    aria-label={`Drag to reorder “${t.title}”`}
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} />
                  </button>
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}

/** A task tag ("#urgent"): small and quiet, colored by its name (same tag → same color everywhere). */
export function TagChip({ tag, onClick, active }: { tag: string; onClick?: () => void; active?: boolean }) {
  const hue = [...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
  const style = { "--h": hue } as React.CSSProperties;
  const cls = `tag-chip inline-flex items-center rounded-[5px] px-1.5 py-[0.5px] text-[11px] font-medium leading-[16px] ${active ? "ring-1 ring-current" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} style={style} aria-pressed={active}>
      #{tag}
    </button>
  ) : (
    <span className={cls} style={style}>
      #{tag}
    </span>
  );
}
