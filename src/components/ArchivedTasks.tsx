"use client";

import { useState, useTransition } from "react";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { deleteTask, unarchiveTask } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { formatDay, ymdInTz } from "@/lib/dates";
import type { TaskDTO } from "@/lib/data";
import { useReport, useWork } from "./TaskSheet";

/** Tasks → Archived: done tasks that were put away, by the month they were finished; restore or delete for good. */
export function ArchivedTasks({ tasks }: { tasks: TaskDTO[] }) {
  const { tz, projects } = useWork();
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = tasks.filter((t) => {
    const hay = `${t.title} ${t.notes ?? ""} ${projects.find((p) => p.id === t.projectId)?.name ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const groups = new Map<string, TaskDTO[]>();
  for (const t of shown) {
    const when = t.completedAt ?? t.archivedAt;
    const key = when ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", year: "numeric" }).format(new Date(when)) : "Earlier";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <div className="animate-in mx-auto max-w-3xl">
      <label className="relative mb-4 block">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search archived tasks" aria-label="Search archived tasks" className="input !rounded-[9px] !py-[7px] !pl-8 !text-[13px]" />
      </label>
      {!tasks.length && <p className="card py-10 text-center text-[13.5px] text-ink-2">Nothing archived yet. Archive done tasks from the board (⋯ on the Done column or on a card).</p>}
      {tasks.length > 0 && !shown.length && <p className="py-8 text-center text-[13.5px] text-ink-3">No archived tasks match.</p>}
      <div className="space-y-5">
        {[...groups].map(([month, list]) => (
          <section key={month} className="card !p-0">
            <h2 className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <span className="label-mono">{month}</span>
              <span className="num text-[12px] text-ink-3">{list.length}</span>
            </h2>
            <ul>
              {list.map((t) => (
                <ArchivedRow key={t.id} t={t} doneOn={t.completedAt ? ymdInTz(new Date(t.completedAt), tz) : null} project={projects.find((p) => p.id === t.projectId)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ArchivedRow({ t, doneOn, project }: { t: TaskDTO; doneOn: string | null; project?: { name: string; emoji: string | null; color: string } }) {
  const report = useReport();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <li className={`flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 ${pending ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-ink-2 line-through decoration-ink-3/60">{t.title}</div>
        <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
          {project && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: projectColor(project.color).hex }} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {doneOn && <span className="num shrink-0">Done {formatDay(doneOn)}</span>}
        </div>
      </div>
      <button className="btn btn-secondary !px-2.5 !py-1 !text-[12.5px]" disabled={pending} onClick={() => start(async () => void report(await unarchiveTask(t.id)))}>
        <ArchiveRestore size={13} /> Restore
      </button>
      {confirm ? (
        <button className="btn btn-danger !px-2.5 !py-1 !text-[12.5px]" disabled={pending} onBlur={() => setConfirm(false)} onClick={() => start(async () => void report(await deleteTask(t.id)))}>
          Delete for good
        </button>
      ) : (
        <button className="rounded-[7px] p-1.5 text-ink-3 hover:bg-surface-2 hover:text-bad" aria-label={`Delete ${t.title}`} onClick={() => setConfirm(true)}>
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
