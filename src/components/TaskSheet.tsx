"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { CalendarClock, ExternalLink, Trash2, X } from "lucide-react";
import { createTask, deleteTask, updateTask, type ActionResult } from "@/app/actions";
import { formatDuration, minutesInTz, ymdInTz, zonedToUtc } from "@/lib/dates";
import { PRIORITIES, type BoardColumnDTO } from "@/lib/kanban";
import type { TaskDTO } from "@/lib/data";
import { Field, Sheet } from "./Sheet";
import { columnColor } from "./ui";
import { GoogleMark, NotionMark } from "./ui";

export type ProjectOption = { id: string; name: string; emoji: string | null; color: string };

type Defaults = Partial<Pick<TaskDTO, "projectId" | "status" | "dueDate" | "scheduledStart" | "durationMin">>;

type Ctx = {
  tz: string;
  today: string;
  projects: ProjectOption[];
  defaultDuration: number;
  googleTarget: string | null;
  /** Board columns (built-in + custom) of the Tasks and Projects boards. */
  taskColumns: BoardColumnDTO[];
  projectColumns: BoardColumnDTO[];
  openTask: (task: TaskDTO | null, defaults?: Defaults) => void;
  toast: (msg: string, tone?: "ok" | "bad") => void;
};

const WorkContext = createContext<Ctx | null>(null);

export function useWork() {
  const c = useContext(WorkContext);
  if (!c) throw new Error("useWork outside WorkProvider");
  return c;
}

/** Holds app-wide context (time zone, projects) and the one task editor sheet + toast. */
export function WorkProvider({
  tz,
  today,
  projects,
  defaultDuration,
  googleTarget,
  taskColumns,
  projectColumns,
  children,
}: {
  tz: string;
  today: string;
  projects: ProjectOption[];
  defaultDuration: number;
  googleTarget: string | null;
  taskColumns: BoardColumnDTO[];
  projectColumns: BoardColumnDTO[];
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState<{ task: TaskDTO | null; defaults: Defaults; key: number } | null>(null);
  const [toastMsg, setToast] = useState<{ msg: string; tone: "ok" | "bad"; key: number } | null>(null);

  const toast = useCallback((msg: string, tone: "ok" | "bad" = "ok") => {
    const key = Date.now();
    setToast({ msg, tone, key });
    setTimeout(() => setToast((t) => (t?.key === key ? null : t)), 4500);
  }, []);
  const openTask = useCallback((task: TaskDTO | null, defaults: Defaults = {}) => setEditing({ task, defaults, key: Date.now() }), []);
  const value = useMemo(
    () => ({ tz, today, projects, defaultDuration, googleTarget, taskColumns, projectColumns, openTask, toast }),
    [tz, today, projects, defaultDuration, googleTarget, taskColumns, projectColumns, openTask, toast],
  );

  return (
    <WorkContext.Provider value={value}>
      {children}
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.task ? "Edit task" : "New task"}>
        {editing && <TaskForm key={editing.key} task={editing.task} defaults={editing.defaults} onDone={() => setEditing(null)} />}
      </Sheet>
      {toastMsg && (
        <div
          role="status"
          className={`card animate-in fixed bottom-24 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 !px-4 !py-2.5 text-[13.5px] shadow-xl md:bottom-6 ${
            toastMsg.tone === "bad" ? "text-bad" : ""
          }`}
          style={{ background: "var(--card-bg-strong)" }}
        >
          <span>{toastMsg.msg}</span>
          <button aria-label="Dismiss" onClick={() => setToast(null)} className="text-ink-3 hover:text-ink">
            <X size={14} />
          </button>
        </div>
      )}
    </WorkContext.Provider>
  );
}

/** Reports an action's outcome as a toast; returns true when it worked. */
export function useReport() {
  const { toast } = useWork();
  return useCallback(
    (r: ActionResult) => {
      if (!r.ok) toast(r.error, "bad");
      else if (r.message) toast(r.message);
      return r.ok;
    },
    [toast],
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function TaskForm({ task, defaults, onDone }: { task: TaskDTO | null; defaults: Defaults; onDone: () => void }) {
  const { tz, projects, defaultDuration, googleTarget, taskColumns } = useWork();
  const report = useReport();
  const [pending, start] = useTransition();
  const init = { ...defaults, ...(task ?? {}) };
  const sched = init.scheduledStart ? new Date(init.scheduledStart) : null;
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [projectId, setProjectId] = useState(init.projectId ?? "");
  const [status, setStatus] = useState(init.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? 0);
  const [dueDate, setDueDate] = useState(init.dueDate ?? "");
  const [duration, setDuration] = useState(init.durationMin ?? defaultDuration);
  const [schedDay, setSchedDay] = useState(sched ? ymdInTz(sched, tz) : "");
  const [schedTime, setSchedTime] = useState(sched ? (() => { const m = minutesInTz(sched, tz); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; })() : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scheduledIso = () => {
    if (!schedDay) return null;
    const [h, m] = (schedTime || "09:00").split(":").map(Number);
    return zonedToUtc(schedDay, h * 60 + m, tz).toISOString();
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { title, notes, projectId: projectId || null, status, priority, dueDate: dueDate || null, durationMin: duration, scheduledStart: scheduledIso() };
    start(async () => {
      const r = task ? await updateTask(task.id, input) : await createTask(input);
      if (report(r)) onDone();
    });
  };

  return (
    <form onSubmit={save} className="space-y-3.5">
      <input
        autoFocus={!task}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className="input !text-[17px] font-medium"
        required
        maxLength={300}
      />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} className="input resize-y !text-[14px]" />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input !text-[14px]">
            <option value="">No project (Inbox)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji ? `${p.emoji} ` : ""}
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="input !text-[14px]">
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Status">
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {taskColumns
            .filter((c) => !c.hidden || c.key === status)
            .map((c) => (
              <label key={c.key} className="chip inline-flex cursor-pointer items-center gap-1.5 has-[:checked]:!border-ink has-[:checked]:!bg-ink has-[:checked]:!text-surface">
                <input type="radio" name="status" value={c.key} checked={status === c.key} onChange={() => setStatus(c.key)} className="sr-only" />
                <span className="h-2 w-2 rounded-full" style={{ background: columnColor(c.color) }} />
                {c.label}
              </label>
            ))}
        </div>
      </Field>

      <Field label="Due date">
        <div className="flex gap-2">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input !text-[14px]" />
          {dueDate && (
            <button type="button" className="btn btn-ghost" onClick={() => setDueDate("")}>
              Clear
            </button>
          )}
        </div>
      </Field>

      <div className="rounded-xl bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-ink-2">
          <CalendarClock size={14} /> Time block
          <span className="ml-auto text-[12px] font-normal text-ink-3">{googleTarget ? `Also added to ${googleTarget}` : "Shown on your calendar here"}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input type="date" value={schedDay} onChange={(e) => setSchedDay(e.target.value)} className="input !bg-surface !text-[14px]" aria-label="Day" />
          <input type="time" step={900} value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="input !bg-surface !text-[14px]" aria-label="Start time" disabled={!schedDay} />
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="input !bg-surface !text-[14px]" aria-label="Duration">
            {[15, 30, 45, 60, 90, 120, 180, 240].concat([15, 30, 45, 60, 90, 120, 180, 240].includes(duration) ? [] : [duration]).map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        </div>
        {schedDay && (
          <button type="button" className="btn btn-ghost mt-1 !px-1" onClick={() => (setSchedDay(""), setSchedTime(""))}>
            Remove from calendar
          </button>
        )}
        <p className="mt-1 text-[12px] text-ink-3">Tip: drag tasks onto the calendar to schedule them.</p>
      </div>

      {task?.fromNotion && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <NotionMark size={13} /> Imported from a Notion to-do that mentions you. Checking it off in Notion marks it done here.
        </p>
      )}

      {task?.fromGoogleTasks && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <GoogleMark size={13} /> Synced with Google Tasks — title, notes, due date and done go both ways. Priority, project and time blocks stay here.
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {task &&
          (confirmDelete ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (report(await deleteTask(task.id))) onDone();
                })
              }
            >
              <Trash2 size={14} /> Delete for good
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete task">
              <Trash2 size={14} />
            </button>
          ))}
        {task && (
          <a href={`/tasks?task=${task.id}`} className="btn btn-ghost hidden sm:inline-flex" aria-label="Link to this task">
            <ExternalLink size={14} />
          </a>
        )}
        <button className="btn btn-primary ml-auto" disabled={pending}>
          {pending ? "Saving…" : task ? "Save" : "Add task"}
        </button>
      </div>
    </form>
  );
}
