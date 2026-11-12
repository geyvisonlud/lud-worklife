import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OpenInNotion, TaskBoardView } from "@/components/Kanban";
import { NotionContent } from "@/components/NotionContent";
import { ProjectButton, RefreshNotion } from "@/components/ProjectSheet";
import { NewTaskButton } from "@/components/TaskBits";
import { Card, NotionMark, ProgressBar, notionReasonLabel } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { prisma } from "@/lib/db";
import { formatDay, relativeTime } from "@/lib/dates";
import { boardColumns, notionContent, projectDTO, taskDTO } from "@/lib/data";
import { columnLabel } from "@/lib/kanban";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const row = await prisma.project.findUnique({ where: { id }, include: { tasks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } } });
  if (!row) notFound();
  const p = projectDTO(row);
  const tasks = row.tasks.filter((t) => !t.archivedAt).map(taskDTO);
  const c = projectColor(p.color);
  const blocks = notionContent(row);
  const showNotion = tab === "notion" && p.source === "notion";
  const pct = p.taskCount ? p.doneCount / p.taskCount : 0;

  return (
    <div className="space-y-5">
      <Link href="/projects" className="animate-in inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ChevronLeft size={14} /> Projects
      </Link>

      <section
        className="card animate-in relative overflow-hidden !p-0"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${c.hex} 20%, var(--card-bg)), color-mix(in srgb, ${c.hex} 5%, var(--card-bg)) 70%)` }}
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-5 pb-5 pt-6 md:px-7 md:pt-8">
          <div className="min-w-0 flex-1">
            <div className="mb-3 text-[44px] leading-none">{p.emoji}</div>
            <h1 className="title-serif">{p.name}</h1>
            {p.description && <p className="mt-2 max-w-2xl text-[14.5px] text-ink-2">{p.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="pill !py-0.5">{columnLabel(await boardColumns("projects"), p.stage)}</span>
              {p.dueDate && <span className="pill !py-0.5">Target {formatDay(p.dueDate)}</span>}
              {p.source === "notion" && (
                <span className="pill !py-0.5">
                  <NotionMark size={12} /> {notionReasonLabel(p.notionReason)}
                  {p.notionParent ? ` · ${p.notionParent}` : ""}
                  {p.notionStatus ? ` · “${p.notionStatus}”` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="w-full sm:w-56">
            <div className="num mb-1.5 flex justify-between text-[12.5px] text-ink-2">
              <span>
                {p.doneCount} of {p.taskCount} done
              </span>
              <span className="font-medium text-ink">{Math.round(pct * 100)}%</span>
            </div>
            <ProgressBar pct={pct} color={c.hex} />
          </div>
        </div>
      </section>

      <div className="animate-in flex flex-wrap items-center gap-2">
        {p.source === "notion" && (
          <nav className="flex gap-1.5" aria-label="Sections">
            <Link href={`/projects/${p.id}`} className="pill" aria-current={!showNotion ? "page" : undefined}>
              Board
            </Link>
            <Link href={`/projects/${p.id}?tab=notion`} className="pill" aria-current={showNotion ? "page" : undefined}>
              <NotionMark size={12} /> Notion page
            </Link>
          </nav>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {p.notionUrl && <OpenInNotion url={p.notionUrl} />}
          {p.source === "notion" && <RefreshNotion id={p.id} />}
          <ProjectButton project={p} />
          <NewTaskButton projectId={p.id} />
        </div>
      </div>

      {showNotion ? (
        <Card title="Notion page" action={row.notionSyncedAt ? <span className="text-[12px] text-ink-3">Imported {relativeTime(row.notionSyncedAt)} · read-only copy</span> : null}>
          <div className="mx-auto max-w-3xl py-2">{blocks.length ? <NotionContent blocks={blocks} /> : <p className="text-ink-2">This page is empty.</p>}</div>
        </Card>
      ) : (
        <TaskBoardView tasks={tasks} projectId={p.id} />
      )}
    </div>
  );
}
