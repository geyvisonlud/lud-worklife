"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarClock, Clock, Flag, Plus } from "lucide-react";
import { createTask, toggleTask } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { formatClock, formatDuration, minutesInTz, relativeDay, ymdInTz, daysBetween } from "@/lib/dates";
import type { TaskDTO } from "@/lib/data";
import { parseQuickAdd } from "@/lib/tasks";
import { dragState } from "./dragState";
import { useReport, useWork } from "./TaskSheet";
import { GoogleMark, NotionMark } from "./ui";

export const PRIORITY_COLOR = ["var(--ink-3)", "var(--c1)", "var(--warn)", "var(--bad)"];

/** Round checkbox; ring color = priority. Optimistic. */
export function TaskCheck({ task, size = 18 }: { task: TaskDTO; size?: number }) {
  const report = useReport();
  const [checked, setChecked] = useState(task.status === "done");
  const [, start] = useTransition();
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
        start(async () => {
          if (!report(await toggleTask(task.id, next))) setChecked(!next);
        });
      }}
      className="group/check inline-flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
      style={{
        width: size,
        height: size,
        boxShadow: `inset 0 0 0 1.6px ${checked ? "var(--good)" : color}`,
        background: checked ? "var(--good)" : task.priority >= 2 ? `color-mix(in srgb, ${color} 10%, transparent)` : "transparent",
      }}
    >
      <svg viewBox="0 0 16 16" width={size * 0.6} height={size * 0.6} className={checked ? "text-white" : "text-ink-3 opacity-0 group-hover/check:opacity-100"} aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Small meta line: project · due · time block · duration · Notion. */
export function TaskMeta({ task, showProject = true }: { task: TaskDTO; showProject?: boolean }) {
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
  if (task.fromGoogleTasks)
    bits.push(
      <span key="g" className="inline-flex items-center" title="Synced with Google Tasks">
        <GoogleMark size={11} />
      </span>,
    );
  if (!bits.length) return null;
  return <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-2">{bits}</div>;
}

/** A task in a list. `draggable` lets it be dropped on the calendar. */
export function TaskRow({ task, showProject = true, draggable = false, compact = false }: { task: TaskDTO; showProject?: boolean; draggable?: boolean; compact?: boolean }) {
  const { openTask } = useWork();
  const done = task.status === "done";
  return (
    <div
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
      <div className="pt-[1px]">
        <TaskCheck task={task} />
      </div>
      <button type="button" onClick={() => openTask(task)} className="min-w-0 flex-1 text-left">
        <div className={`truncate text-[14.5px] leading-[1.35] ${done ? "text-ink-3 line-through" : ""}`}>{task.title}</div>
        {!compact && <TaskMeta task={task} showProject={showProject} />}
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
    start(async () => {
      const r = await createTask({ title: q.title, projectId: projectId ?? null, status, priority: q.priority, dueDate: q.dueDate ?? (dueToday ? today : null), ...(q.durationMin ? { durationMin: q.durationMin } : {}) });
      if (report(r)) setValue("");
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
          disabled={pending}
        />
      </div>
      {value && <div className="pb-0.5 pl-6 text-[11px] text-ink-3">Enter to add · today · tomorrow · !high · 45m</div>}
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
