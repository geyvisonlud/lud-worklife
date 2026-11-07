import { GoogleTasksAutoSync } from "@/components/ConnectionBits";
import Link from "next/link";
import { KanbanSquare, List } from "lucide-react";
import { TaskBoard } from "@/components/Kanban";
import { OpenTask } from "@/components/OpenTask";
import { NewTaskButton, QuickAdd, TaskRow } from "@/components/TaskBits";
import { Card, PageHeader } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { appTimeZone } from "@/lib/dates";
import { listProjects, listTasks, today } from "@/lib/data";
import { BUCKETS, groupTasks } from "@/lib/tasks";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; project?: string; task?: string; done?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "list";
  const showDone = sp.done === "1";
  const projectFilter = sp.project === "inbox" ? null : sp.project;
  const tz = appTimeZone();
  const day = today();
  const [tasks, projects] = await Promise.all([
    listTasks({
      ...(sp.project ? { projectId: projectFilter ?? null } : {}),
      ...(showDone || view === "board" ? {} : { OR: [{ status: { not: "done" } }, { completedAt: { gte: new Date(Date.now() - 2 * 86400_000) } }] }),
    }),
    listProjects(),
  ]);
  const g = groupTasks(tasks, day, tz);
  const open = sp.task ? (await listTasks({ id: sp.task }))[0] ?? null : null;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: sp.view, project: sp.project, done: sp.done, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/tasks${s ? `?${s}` : ""}`;
  };
  const counts = new Map<string | null, number>();
  for (const t of tasks) if (t.status !== "done") counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);

  return (
    <div>
      <OpenTask task={open} />
      <GoogleTasksAutoSync />
      <PageHeader eyebrow={`${tasks.filter((t) => t.status !== "done").length} open`} title="Tasks">
        <div className="seg-sm" role="group" aria-label="View">
          <Link href={q({ view: undefined })} aria-pressed={view === "list"} className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px]" style={view === "list" ? { background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : {}}>
            <List size={13} /> List
          </Link>
          <Link href={q({ view: "board" })} aria-pressed={view === "board"} className="inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px]" style={view === "board" ? { background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : {}}>
            <KanbanSquare size={13} /> Board
          </Link>
        </div>
        <NewTaskButton projectId={projectFilter ?? undefined} />
      </PageHeader>

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

      {view === "board" ? (
        <TaskBoard tasks={tasks} projectId={sp.project ? (projectFilter ?? undefined) : undefined} />
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
