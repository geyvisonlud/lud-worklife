import { GoogleTasksAutoSync } from "@/components/ConnectionBits";
import Link from "next/link";
import { KanbanSquare, List } from "lucide-react";
import { boardStats } from "@/lib/tasks";
import { TaskBoardView } from "@/components/Kanban";
import { OpenTask } from "@/components/OpenTask";
import { NewTaskButton, QuickAdd, TaskRow } from "@/components/TaskBits";
import { Card } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { appTimeZone } from "@/lib/dates";
import { listProjects, listTasks, today } from "@/lib/data";
import { BUCKETS, groupTasks } from "@/lib/tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; project?: string; task?: string; done?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const showDone = sp.done === "1";
  const projectFilter = sp.project === "inbox" ? null : sp.project;
  const tz = appTimeZone();
  const day = today();
  const [tasks, projects] = await Promise.all([
    listTasks({
      ...(sp.project && view === "list" ? { projectId: projectFilter ?? null } : {}),
      // Board: open tasks + done in the last 30 days; list: + done in the last 2 days (or all).
      ...(showDone ? {} : { OR: [{ status: { not: "done" } }, { completedAt: { gte: new Date(Date.now() - (view === "board" ? 30 : 2) * 86400_000) } }] }),
    }),
    listProjects(),
  ]);
  const g = groupTasks(tasks, day, tz);
  const stats = boardStats(tasks, day);
  const open = sp.task ? (await listTasks({ id: sp.task }))[0] ?? null : null;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: sp.view, project: sp.project, done: sp.done, ...o };
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

      {view === "list" && (
        <nav className="animate-in mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Filter by project">
          <Link href={q({ project: undefined })} className="pill shrink-0" aria-current={!sp.project ? "page" : undefined}>
            All
          </Link>
          <Link href={q({ project: "inbox" })} className="pill shrink-0" aria-current={sp.project === "inbox" ? "page" : undefined}>
            No project
          </Link>
          {projects
            .filter((p) => p.stage !== "done")
            .map((p) => (
              <Link key={p.id} href={q({ project: p.id })} className="pill shrink-0" aria-current={sp.project === p.id ? "page" : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: projectColor(p.color).hex }} />
                {p.emoji} {p.name}
              </Link>
            ))}
        </nav>
      )}

      {view === "board" ? (
        <TaskBoardView tasks={tasks} initialProject={sp.project === "inbox" ? "none" : sp.project} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <Card title="Add">
              <QuickAdd projectId={projectFilter ?? null} />
              <p className="mt-2 text-[12px] text-ink-3">Type “today”, “tomorrow” or a date, “!high”, and a length like “45m” or “1.5h”.</p>
            </Card>
            {(["overdue", "today"] as const).map((b) =>
              g[b].length ? (
                <Card key={b} title={`${BUCKETS.find((x) => x.key === b)!.label} · ${g[b].length}`}>
                  {g[b].map((t) => (
                    <TaskRow key={t.id} task={t} showProject={!sp.project} />
                  ))}
                </Card>
              ) : null,
            )}
          </div>
          <div className="space-y-5">
            {(["upcoming", "inbox"] as const).map((b) => (
              <Card key={b} title={`${BUCKETS.find((x) => x.key === b)!.label} · ${g[b].length}`}>
                {g[b].map((t) => (
                  <TaskRow key={t.id} task={t} showProject={!sp.project} />
                ))}
                {!g[b].length && <p className="py-4 text-center text-[13.5px] text-ink-3">{b === "inbox" ? "Inbox zero." : "Nothing coming up."}</p>}
              </Card>
            ))}
            <Card
              title={`Done${showDone ? "" : " · last 2 days"}`}
              action={
                <Link href={q({ done: showDone ? undefined : "1" })} className="text-[12px] text-accent">
                  {showDone ? "Recent only" : "Show all"}
                </Link>
              }
            >
              {g.done.map((t) => (
                <TaskRow key={t.id} task={t} showProject={!sp.project} compact />
              ))}
              {!g.done.length && <p className="py-4 text-center text-[13.5px] text-ink-3">Nothing finished yet.</p>}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
