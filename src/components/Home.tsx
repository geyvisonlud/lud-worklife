"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleDashed, FolderKanban, TriangleAlert } from "lucide-react";
import { projectColor } from "@/lib/colors";
import { formatDay, relativeTime } from "@/lib/dates";
import type { ProjectDTO, TaskDTO } from "@/lib/data";
import type { Activity, DeadlineGroup } from "@/lib/home";
import { dueLabel } from "@/lib/home";
import { columnLabel } from "@/lib/kanban";
import { NewTaskButton, QuickAdd, SortableTasks, TaskRow } from "./TaskBits";
import { useWork } from "./TaskSheet";
import { ProjectButton } from "./ProjectSheet";
import { columnColor } from "./ui";

/* --------------------------------------------------------------- header */

/** "Good evening, Geyvison" + the date and a one-line summary, with the main actions on the right. */
export function HomeHeader({ greeting, subtitle }: { greeting: string; subtitle: string }) {
  return (
    <header className="animate-in flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[34px]">{greeting}</h1>
        <p className="mt-1.5 text-[14px] text-ink-2">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectButton secondary />
        <NewTaskButton />
      </div>
    </header>
  );
}

/* ----------------------------------------------------------- stat strip */

export type HomeStats = { activeProjects: number; atRisk: number; openTasks: number; dueToday: number; overdue: number; completedWeek: number };

/** Four figures in one card: active projects, open tasks, completed this week, overdue. */
export function StatStrip({ s }: { s: HomeStats }) {
  const cells = [
    { icon: FolderKanban, label: "Active projects", value: s.activeProjects, hint: s.atRisk ? `${s.atRisk} at risk` : "All on track", tone: s.atRisk ? "warn" : "", href: "/projects" },
    { icon: CircleDashed, label: "Open tasks", value: s.openTasks, hint: `${s.dueToday} due today`, tone: "", href: "/tasks?view=list" },
    { icon: CheckCircle2, label: "Completed", value: s.completedWeek, hint: "this week", tone: "good", href: "/tasks?view=archived" },
    { icon: TriangleAlert, label: "Overdue", value: s.overdue, hint: s.overdue ? "need attention" : "all caught up", tone: s.overdue ? "bad" : "good", href: "/tasks?view=list" },
  ];
  const toneCls = (t: string) => (t === "bad" ? "text-bad" : t === "good" ? "text-good" : t === "warn" ? "text-warn" : "text-ink-2");
  return (
    <section className="card animate-in grid grid-cols-2 !p-0 lg:grid-cols-4">
      {cells.map(({ icon: Icon, label, value, hint, tone, href }, i) => (
        <Link
          key={label}
          href={href}
          className={`group block px-5 py-4 transition-colors hover:bg-surface-2/60 ${i % 2 ? "border-l border-hairline" : ""} ${i >= 2 ? "border-t border-hairline lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
        >
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <Icon size={14} className="text-ink-3" /> {label}
          </div>
          <div className={`num mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em] ${label === "Overdue" && value ? "text-bad" : ""}`}>{value}</div>
          <div className={`mt-2 text-[12px] font-medium ${toneCls(tone)}`}>{hint}</div>
        </Link>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------- my tasks */

type Tab = "today" | "upcoming" | "overdue" | "completed";

/** "My tasks" with tabs (Today / Upcoming / Overdue / Completed): quick add on Today; rows reorder by dragging. */
export function MyTasks({ today: todayTasks, upcoming, overdue, completed }: { today: TaskDTO[]; upcoming: TaskDTO[]; overdue: TaskDTO[]; completed: TaskDTO[] }) {
  const [tab, setTab] = useState<Tab>(todayTasks.length ? "today" : overdue.length ? "overdue" : "upcoming");
  const tabs: [Tab, string, number][] = [
    ["today", "Today", todayTasks.length],
    ["upcoming", "Upcoming", upcoming.length],
    ["overdue", "Overdue", overdue.length],
    ["completed", "Completed", completed.length],
  ];
  const list = tab === "today" ? todayTasks : tab === "upcoming" ? upcoming : tab === "overdue" ? overdue : completed;
  return (
    <section className="card animate-in !px-0 !pb-2">
      <div className="flex flex-wrap items-center gap-3 px-[var(--pad-x)]">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">My tasks</h2>
        <div className="ml-auto inline-flex rounded-[10px] border border-hairline bg-surface-2 p-[2px]" role="tablist">
          {tabs.map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-[8px] px-2.5 py-[4px] text-[12.5px] font-medium ${tab === k ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`}
            >
              {label} <span className={`num ${k === "overdue" && n ? "text-bad" : "text-ink-3"}`}>{n}</span>
            </button>
          ))}
        </div>
        <Link href="/tasks?view=list" className="rounded-[7px] p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="All tasks" title="All tasks">
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {tab === "today" && (
        <div className="mt-3 px-[var(--pad-x)]">
          <QuickAdd placeholder="Add a task for today…" dueToday />
        </div>
      )}
      <div className="mt-2 border-t border-hairline px-[calc(var(--pad-x)-6px)] pt-1">
        {tab === "completed" ? (
          completed.map((t) => <TaskRow key={t.id} task={t} compact />)
        ) : (
          <SortableTasks key={tab} tasks={list} inline group={tab === "upcoming" ? "upcoming" : undefined} />
        )}
        {!list.length && (
          <p className="py-8 text-center text-[13.5px] text-ink-2">
            {tab === "today" ? "Nothing due today." : tab === "overdue" ? "Nothing overdue — nice." : tab === "upcoming" ? "Nothing coming up." : "Nothing finished this week yet."}
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------ project progress */

/** Projects as a table: icon + name, status pill (board column), progress bar with %, due date. */
export function ProjectProgress({ projects, today }: { projects: ProjectDTO[]; today: string }) {
  const { projectColumns } = useWork();
  const rows = projects.filter((p) => p.stage !== "done").slice(0, 8);
  return (
    <section className="card animate-in !px-0 !pb-1">
      <div className="flex items-center justify-between px-[var(--pad-x)]">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Project progress</h2>
        <Link href="/projects" className="text-[12.5px] text-ink-2 hover:text-ink">
          All projects
        </Link>
      </div>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-hairline text-[12px] text-ink-3">
                <th className="py-2 pl-[var(--pad-x)] pr-3 font-medium">Project</th>
                <th className="w-[130px] px-3 py-2 font-medium">Status</th>
                <th className="w-[190px] px-3 py-2 font-medium">Progress</th>
                <th className="w-[110px] py-2 pl-3 pr-[var(--pad-x)] font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const c = projectColor(p.color);
                const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
                const col = projectColumns.find((x) => x.key === p.stage);
                const late = p.dueDate && p.dueDate < today;
                return (
                  <tr key={p.id} className="border-b border-hairline last:border-b-0 hover:bg-surface-2/50">
                    <td className="py-2.5 pl-[var(--pad-x)] pr-3">
                      <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[14px]" style={{ background: `color-mix(in srgb, ${c.hex} 16%, var(--surface))`, color: c.hex }}>
                          {p.emoji ?? <FolderKanban size={14} />}
                        </span>
                        <span className="truncate font-medium">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[7px] border border-hairline px-2 py-[2px] text-[12px] font-medium">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: late ? "var(--bad)" : columnColor(col?.color ?? "gray") }} />
                        <span className="truncate">{late ? "At risk" : columnLabel(projectColumns, p.stage)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(pct ? 4 : 0, pct)}%`, background: c.hex }} />
                        </div>
                        <span className="num w-9 text-right text-[12px] text-ink-2">{pct}%</span>
                      </div>
                    </td>
                    <td className={`num py-2.5 pl-3 pr-[var(--pad-x)] text-[12.5px] ${late ? "font-medium text-bad" : "text-ink-2"}`} title={dueLabel(p.dueDate, today) ?? undefined}>
                      {p.dueDate ? formatDay(p.dueDate).replace(/^\w+, /, "") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-[var(--pad-x)] py-6 text-[13.5px] text-ink-2">
          No project going right now.
          <ProjectButton />
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------- upcoming deadlines */

export type DeadlineItem = { id: string; title: string; dueDate: string | null; color: string; href?: string; task?: TaskDTO; kind: "task" | "project" };

export function UpcomingDeadlines({ groups }: { groups: DeadlineGroup<DeadlineItem>[] }) {
  const { openTask } = useWork();
  return (
    <section className="card animate-in">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Upcoming deadlines</h2>
      {groups.length ? (
        <div className="mt-3 space-y-3.5">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 text-[12px] font-medium text-ink-2">
                {g.label} <span className="num text-ink-3">{g.items.length + g.more}</span>
              </div>
              <ul className="space-y-px">
                {g.items.map((it) => (
                  <li key={`${it.kind}:${it.id}`}>
                    {it.task ? (
                      <button type="button" onClick={() => openTask(it.task!)} className="flex w-full items-center gap-2.5 rounded-[7px] px-1 py-[5px] text-left text-[13.5px] hover:bg-surface-2">
                        <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: it.color }} />
                        <span className="truncate">{it.title}</span>
                      </button>
                    ) : (
                      <Link href={it.href ?? "/projects"} className="flex items-center gap-2.5 rounded-[7px] px-1 py-[5px] text-[13.5px] hover:bg-surface-2">
                        <FolderKanban size={13} className="shrink-0" style={{ color: it.color }} />
                        <span className="truncate font-medium">{it.title}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {g.more > 0 && (
                <Link href="/tasks?view=list" className="ml-5 text-[12px] text-ink-3 hover:text-ink">
                  +{g.more} more
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">Nothing due in the next 7 days.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------- recent activity */

const VERB: Record<Activity["verb"], string> = { completed: "You completed", added: "You added", created: "You created", imported: "Imported", edited: "You edited" };

export function RecentActivity({ items }: { items: Activity[] }) {
  return (
    <section className="card animate-in">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Recent activity</h2>
      {items.length ? (
        <ul className="mt-3 space-y-2.5">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2.5">
              <span className={`mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${a.verb === "completed" ? "bg-good-soft text-good" : "bg-surface-2 text-ink-3"}`}>
                {a.verb === "completed" ? "✓" : a.what === "note" ? "✎" : a.what === "project" ? "▣" : "+"}
              </span>
              <div className="min-w-0 text-[13px] leading-snug">
                <span className="text-ink-2">
                  {VERB[a.verb]} {a.what === "note" ? "a note" : a.what === "project" ? "the project" : ""}{" "}
                </span>
                <Link href={a.href} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <div className="num text-[11.5px] text-ink-3">{relativeTime(new Date(a.at))}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">Nothing yet.</p>
      )}
    </section>
  );
}

