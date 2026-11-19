import { GoogleTasksAutoSync } from "@/components/ConnectionBits";
import Link from "next/link";
import { Archive, KanbanSquare, List } from "lucide-react";
import { ArchivedTasks } from "@/components/ArchivedTasks";
import { ArchiveDoneButton, NewTaskButton } from "@/components/TaskBits";
import { prisma } from "@/lib/db";
import { boardStats } from "@/lib/tasks";
import { TaskBoardView } from "@/components/Kanban";
import { OpenTask } from "@/components/OpenTask";
import { projectColor } from "@/lib/colors";
import { addDays, appTimeZone, isYmd } from "@/lib/dates";
import { eventsBetween, listProjects, listTasks, taskDTO, today } from "@/lib/data";
import { TaskListView } from "@/components/TaskListView";
import { groupTasks } from "@/lib/tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; project?: string; task?: string; done?: string; day?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : sp.view === "archived" ? "archived" : "board";
  const showDone = sp.done === "1";
  const projectFilter = sp.project === "inbox" ? null : sp.project;
  const tz = appTimeZone();
  const day = today();
  // List view: the agenda on the right shows this day (?day=, default today).
  const agendaDay = isYmd(sp.day) ? sp.day : day;
  const [tasks, projects, archived, archivedCount, dayEvents] = await Promise.all([
    listTasks({
      ...(sp.project && view === "list" ? { projectId: projectFilter ?? null } : {}),
      // Board: open tasks + done in the last 30 days; list: + done in the last 2 days (or all).
      ...(showDone ? {} : { OR: [{ status: { not: "done" } }, { completedAt: { gte: new Date(Date.now() - (view === "board" ? 30 : 2) * 86400_000) } }] }),
    }),
    listProjects(),
    view === "archived" ? prisma.task.findMany({ where: { archivedAt: { not: null } }, orderBy: [{ completedAt: "desc" }, { archivedAt: "desc" }], take: 1000 }).then((r) => r.map(taskDTO)) : [],
    prisma.task.count({ where: { archivedAt: { not: null } } }),
    view === "list" ? eventsBetween(agendaDay, addDays(agendaDay, 1)) : [],
  ]);
  const g = groupTasks(tasks, day, tz);
  const stats = boardStats(tasks, day);
  const open = sp.task ? (await listTasks({ id: sp.task }))[0] ?? null : null;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: sp.view, project: sp.project, done: sp.done, day: sp.day, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/tasks${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <OpenTask task={open} />
      <GoogleTasksAutoSync />
      <header className="animate-in mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] md:text-[34px]">Tasks</h1>
          <p className="num mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
            <span>
              <b className="font-semibold text-ink">{stats.open}</b> open
            </span>
            {stats.overdue > 0 && <span className="text-bad">{stats.overdue} overdue</span>}
            <span>
              <b className="font-semibold text-ink">{stats.week}</b> due this week
            </span>
          </p>
        </div>
        <div className="inline-flex rounded-[10px] bg-surface-2 p-[3px]" role="group" aria-label="View">
          {(
            [
              ["board", "Board", KanbanSquare],
              ["list", "List", List],
              ["archived", `Archived${archivedCount ? ` ${archivedCount}` : ""}`, Archive],
            ] as const
          ).map(([v, label, Icon]) => (
            <Link
              key={v}
              href={q({ view: v === "board" ? undefined : v })}
              aria-pressed={view === v}
              className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-[5px] text-[13px] font-medium ${view === v ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`}
            >
              <Icon size={14} /> {label}
            </Link>
          ))}
        </div>
        <NewTaskButton projectId={projectFilter ?? undefined} />
      </header>


      {view === "archived" ? (
        <ArchivedTasks tasks={archived} />
      ) : view === "board" ? (
        <TaskBoardView tasks={tasks} initialProject={sp.project === "inbox" ? "none" : sp.project} />
      ) : (
        <>
          <TaskListView tasks={tasks} events={dayEvents} day={agendaDay} hrefBase={q({ day: undefined })} />
          {g.done.length > 0 && (
            <p className="mx-auto mt-8 flex max-w-[760px] flex-wrap items-center gap-3 px-2 text-[12.5px] text-ink-3">
              <span>
                {g.done.length} done in the last 2 days
              </span>
              <ArchiveDoneButton ids={g.done.map((t) => t.id)} />
              <Link href={q({ view: "archived" })} className="text-accent">
                Archived
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
