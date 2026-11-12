"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, MoreHorizontal, Plus } from "lucide-react";
import { projectColor } from "@/lib/colors";
import { formatDay } from "@/lib/dates";
import type { ProjectDTO, TaskDTO } from "@/lib/data";
import { columnLabel } from "@/lib/kanban";
import { compareTasks } from "@/lib/tasks";
import { filterTasks, projectCards, type TaskFilter } from "@/lib/work-overview";
import { TaskCheck } from "./TaskBits";
import { useWork } from "./TaskSheet";
import { NotionMark } from "./ui";

/* ------------------------------------------------------------ projects */

/**
 * Projects as colored cards: a gradient band in the project's color with its emoji and progress,
 * then its figures (open tasks, done, next due) and a progress bar.
 */
export function ProjectCards({ projects, tasks }: { projects: ProjectDTO[]; tasks: TaskDTO[] }) {
  const { today, projectColumns } = useWork();
  const cards = projectCards(projects, tasks, today);
  if (!cards.length) {
    return (
      <section className="card animate-in flex flex-wrap items-center gap-3 !py-3">
        <span className="label-mono">Projects</span>
        <span className="flex-1 text-[13.5px] text-ink-2">No project going right now.</span>
        <Link href="/projects" className="btn btn-secondary">
          <Plus size={14} /> New project
        </Link>
      </section>
    );
  }
  return (
    <section className="animate-in">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="label-mono">
          <Link href="/projects" className="hover:text-ink">
            Projects ›
          </Link>
        </h2>
        <span className="text-[12px] text-ink-3">
          {cards.length} going · {cards.reduce((n, c) => n + c.open, 0)} open tasks
          {cards.length > 3 && (
            <Link href="/projects" className="ml-2 hidden text-ink-2 hover:text-ink md:inline">
              All projects →
            </Link>
          )}
        </span>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:[&>li:nth-child(n+4)]:hidden">
        {cards.map(({ project: p, open, overdue, nextDue }) => {
          const c = projectColor(p.color);
          const pct = p.taskCount ? p.doneCount / p.taskCount : 0;
          return (
            <li key={p.id} className="w-[82%] shrink-0 snap-start sm:w-[46%] md:w-auto">
              <Link href={`/projects/${p.id}`} className="group block overflow-hidden rounded-[16px] border border-hairline bg-[var(--card-bg-strong)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="relative flex h-[104px] items-center justify-center" style={{ background: `linear-gradient(135deg, ${c.to} 0%, ${c.hex} 115%)` }}>
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-[3px] text-[11.5px] font-medium text-[#151513] shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.hex }} />
                    {p.taskCount ? `${Math.round(pct * 100)}% done` : columnLabel(projectColumns, p.stage)}
                  </span>
                  <span className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/90 text-[#151513] shadow-sm" aria-hidden>
                    <MoreHorizontal size={15} />
                  </span>
                  <span className="text-[34px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-transform group-hover:scale-105" aria-hidden>
                    {p.emoji || "📁"}
                  </span>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{p.name}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12px] text-ink-2">
                    {p.source === "notion" && <NotionMark size={11} />}
                    <span className="truncate">{p.notionParent ?? columnLabel(projectColumns, p.stage)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-[11px] text-ink-3">Open</dt>
                      <dd className="num text-[15px] font-semibold">{open}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-3">Done</dt>
                      <dd className="num text-[15px] font-semibold">
                        {p.doneCount}
                        <span className="text-[12px] font-normal text-ink-3">/{p.taskCount}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-3">{overdue ? "Overdue" : "Next due"}</dt>
                      <dd className={`num truncate text-[15px] font-semibold ${overdue ? "text-bad" : ""}`}>
                        {overdue ? overdue : nextDue ? formatDay(nextDue).replace(/^\w+, /, "") : p.dueDate ? formatDay(p.dueDate).replace(/^\w+, /, "") : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(p.taskCount ? 3 : 0, pct * 100)}%`, background: c.hex }} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- tasks */

const PRIORITY_PILL: Record<number, { label: string; cls: string; dot: string }> = {
  3: { label: "High", cls: "bg-bad-soft text-bad", dot: "var(--bad)" },
  2: { label: "Medium", cls: "bg-warn-soft text-warn", dot: "var(--warn)" },
  1: { label: "Low", cls: "bg-surface-2 text-ink-2", dot: "var(--ink-3)" },
};
const STATUS_PILL: Record<string, { cls: string; dot: string }> = {
  doing: { cls: "bg-accent-soft text-accent", dot: "var(--accent)" },
  todo: { cls: "bg-surface-2 text-ink-2", dot: "var(--ink-3)" },
  backlog: { cls: "bg-surface-2 text-ink-3", dot: "var(--hairline-strong)" },
};

function Pill({ cls, dot, children }: { cls: string; dot: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[2px] text-[11.5px] font-medium ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

/** Notion-style table of open tasks, in projects or not, with a filter. Rows open the task editor. */
export function TaskTable({ tasks, projects, limit = 8 }: { tasks: TaskDTO[]; projects: ProjectDTO[]; limit?: number }) {
  const { today, openTask, taskColumns } = useWork();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const rows = useMemo(() => filterTasks(tasks, filter).sort(compareTasks), [tasks, filter]);
  const open = filterTasks(tasks, "all");
  const high = open.filter((t) => t.priority === 3).length;
  const counts = { all: open.length, projects: filterTasks(tasks, "projects").length, inbox: filterTasks(tasks, "inbox").length };

  return (
    <section className="card animate-in !px-0 !pb-1">
      <div className="flex flex-wrap items-center justify-between gap-3 px-[var(--pad-x)]">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            <Link href="/tasks" className="hover:underline">
              Tasks
            </Link>
          </h2>
          <p className="text-[12px] text-ink-3">
            {open.length} open{high ? ` · ${high} high priority` : ""}
          </p>
        </div>
        <div className="seg-sm" role="group" aria-label="Show">
          {(
            [
              ["all", "All"],
              ["projects", "In projects"],
              ["inbox", "No project"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label} <span className="num text-ink-3">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="border-y border-hairline bg-surface-2/60 text-[11.5px] font-medium text-ink-3">
              <th className="py-2 pl-[var(--pad-x)] pr-3 font-medium">Task</th>
              <th className="hidden w-[104px] px-3 py-2 font-medium sm:table-cell">Priority</th>
              <th className="hidden w-[210px] px-3 py-2 font-medium md:table-cell">Project</th>
              <th className="hidden w-[110px] px-3 py-2 font-medium sm:table-cell">Due</th>
              <th className="w-[128px] py-2 pl-3 pr-[var(--pad-x)] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((t) => {
              const p = t.projectId ? byId.get(t.projectId) : null;
              const pr = PRIORITY_PILL[t.priority];
              const st = STATUS_PILL[t.status] ?? STATUS_PILL.todo;
              const overdue = t.dueDate && t.dueDate < today;
              return (
                <tr key={t.id} onClick={() => openTask(t)} className="cursor-pointer border-b border-hairline last:border-b-0 hover:bg-surface-2/60">
                  <td className="py-2.5 pl-[var(--pad-x)] pr-3">
                    <div className="flex items-start gap-2.5">
                      <span className="pt-[1px]" onClick={(e) => e.stopPropagation()}>
                        <TaskCheck task={t} size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.title}</div>
                        <div className="truncate text-[11.5px] text-ink-3 md:hidden">
                          {p ? p.name : "No project"}
                          {t.dueDate ? ` · ${formatDay(t.dueDate)}` : ""}
                        </div>
                        {t.notes && <div className="hidden truncate text-[11.5px] text-ink-3 md:block">{t.notes.split("\n")[0]}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 sm:table-cell">{pr ? <Pill cls={pr.cls} dot={pr.dot}>{pr.label}</Pill> : <span className="text-ink-3">—</span>}</td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    {p ? (
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate text-ink-2">
                        <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: projectColor(p.color).hex }} />
                        <span className="truncate">{p.name}</span>
                      </span>
                    ) : (
                      <span className="text-ink-3">No project</span>
                    )}
                  </td>
                  <td className={`num hidden whitespace-nowrap px-3 py-2.5 sm:table-cell ${overdue ? "text-bad" : t.dueDate === today ? "font-medium text-ink" : "text-ink-2"}`}>
                    {t.dueDate ? (t.dueDate === today ? "Today" : formatDay(t.dueDate)) : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="py-2.5 pl-3 pr-[var(--pad-x)]">
                    <Pill cls={st.cls} dot={st.dot}>
                      {columnLabel(taskColumns, t.status)}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="py-8 text-center text-[13.5px] text-ink-2">Nothing open here.</p>}
      </div>
      {rows.length > limit && (
        <Link href="/tasks" className="mx-[var(--pad-x)] my-2 inline-flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink">
          {rows.length - limit} more <ArrowRight size={12} />
        </Link>
      )}
    </section>
  );
}
