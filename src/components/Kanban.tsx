"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ExternalLink } from "lucide-react";
import { moveProject, moveTask, type ActionResult } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { relativeDay } from "@/lib/dates";
import { PROJECT_STAGES, TASK_STATUSES, positionAt } from "@/lib/kanban";
import type { ProjectDTO, TaskDTO } from "@/lib/data";
import { QuickAdd, TaskCheck, TaskMeta } from "./TaskBits";
import { useReport, useWork } from "./TaskSheet";
import { NotionMark, ProgressBar, notionReasonLabel } from "./ui";

type Item = { id: string; column: string; position: number };

/**
 * Generic Kanban: drag cards between columns and within a column (HTML5 drag and drop).
 * Moves show instantly and are saved in the background; a failed save puts the card back.
 * On touch devices without drag support, cards open their editor where the column can be changed.
 */
function Board<T extends Item>({
  columns,
  items,
  onMove,
  renderCard,
  footer,
  columnTint,
}: {
  columns: readonly { key: string; label: string }[];
  items: T[];
  onMove: (id: string, column: string, index: number) => Promise<ActionResult>;
  renderCard: (item: T, dragging: boolean) => React.ReactNode;
  footer?: (column: string) => React.ReactNode;
  columnTint?: (column: string) => string | undefined;
}) {
  const report = useReport();
  const [local, setLocal] = useState(items);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: string; index: number } | null>(null);
  const [, start] = useTransition();
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => setLocal(items), [items]);

  const byColumn = (col: string) => local.filter((i) => i.column === col).sort((a, b) => a.position - b.position);

  const indexAt = (col: string, clientY: number) => {
    const el = colRefs.current[col];
    if (!el) return 0;
    const cards = [...el.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== drag);
    const i = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  };

  const drop = (col: string, index: number) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    if (!id) return;
    const moving = local.find((i) => i.id === id);
    if (!moving) return;
    const others = byColumn(col).filter((i) => i.id !== id);
    const position = positionAt(others, index);
    if (moving.column === col && Math.abs(moving.position - position) < 1e-9) return;
    const before = local;
    setLocal(local.map((i) => (i.id === id ? { ...i, column: col, position } : i)));
    start(async () => {
      if (!report(await onMove(id, col, index))) setLocal(before);
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="grid min-w-[880px] gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((c) => {
          const cards = byColumn(c.key);
          const isOver = over?.column === c.key;
          return (
            <div
              key={c.key}
              ref={(el) => {
                colRefs.current[c.key] = el;
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const index = indexAt(c.key, e.clientY);
                if (over?.column !== c.key || over.index !== index) setOver({ column: c.key, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.column === c.key ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(c.key, indexAt(c.key, e.clientY));
              }}
              className={`flex min-h-[240px] flex-col rounded-[14px] border p-2 transition-colors ${isOver ? "border-accent bg-accent-soft" : "border-hairline bg-[var(--card-bg)]"}`}
              style={{ WebkitBackdropFilter: "blur(16px)", backdropFilter: "blur(16px)" }}
              aria-label={c.label}
            >
              <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                <span className="h-2 w-2 rounded-full" style={{ background: columnTint?.(c.key) ?? "var(--ink-3)" }} aria-hidden />
                <h3 className="label-mono !text-ink">{c.label}</h3>
                <span className="num ml-auto text-[12px] text-ink-3">{cards.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {cards.map((item, i) => (
                  <div key={item.id}>
                    {isOver && item.id !== drag && over.index === cards.slice(0, i).filter((x) => x.id !== drag).length && <DropLine />}
                    <div
                      data-card={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id);
                        e.dataTransfer.effectAllowed = "move";
                        // Let the browser grab the drag image before the card fades.
                        requestAnimationFrame(() => setDrag(item.id));
                      }}
                      onDragEnd={() => (setDrag(null), setOver(null))}
                      className={`cursor-grab active:cursor-grabbing ${drag === item.id ? "opacity-40" : ""}`}
                    >
                      {renderCard(item, drag === item.id)}
                    </div>
                  </div>
                ))}
                {isOver && over.index >= cards.filter((x) => x.id !== drag).length && <DropLine />}
                {footer?.(c.key)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DropLine = () => <div className="mx-1 my-0.5 h-[3px] rounded-full bg-accent" aria-hidden />;

/* -------------------------------------------------------------- projects */

const STAGE_TINT: Record<string, string> = { planned: "var(--ink-3)", active: "var(--accent)", hold: "var(--warn)", done: "var(--good)" };

export function ProjectBoard({ projects }: { projects: ProjectDTO[] }) {
  const router = useRouter();
  const { today } = useWork();
  const items = projects.map((p) => ({ ...p, column: p.stage }));
  return (
    <Board
      columns={PROJECT_STAGES}
      items={items}
      columnTint={(c) => STAGE_TINT[c]}
      onMove={(id, col, index) => moveProject(id, col, index)}
      renderCard={(p) => {
        const c = projectColor(p.color);
        const pct = p.taskCount ? p.doneCount / p.taskCount : 0;
        return (
          <div
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/projects/${p.id}`)}
            onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}
            className="overflow-hidden rounded-[12px] border border-hairline bg-surface shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <div className="relative flex h-14 items-center px-3" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${c.hex} 22%, var(--surface)), color-mix(in srgb, ${c.hex} 8%, var(--surface)))` }}>
              <span className="text-[26px] leading-none">{p.emoji ?? ""}</span>
              {p.source === "notion" && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--card-bg-strong)] px-2 py-0.5 text-[10.5px] font-medium text-ink-2">
                  <NotionMark size={10} /> {notionReasonLabel(p.notionReason)}
                </span>
              )}
            </div>
            <div className="px-3 pb-3 pt-2.5">
              <div className="text-[14.5px] font-medium leading-snug">{p.name}</div>
              {p.notionParent && <div className="mt-0.5 truncate text-[11.5px] text-ink-3">in {p.notionParent}</div>}
              {p.taskCount > 0 && (
                <div className="mt-2.5">
                  <ProgressBar pct={pct} color={c.hex} />
                  <div className="num mt-1 flex justify-between text-[11.5px] text-ink-2">
                    <span>
                      {p.doneCount}/{p.taskCount} tasks
                    </span>
                    <span>{Math.round(pct * 100)}%</span>
                  </div>
                </div>
              )}
              {p.dueDate && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-ink-2">
                  <CalendarDays size={11} /> {relativeDay(p.dueDate, today)}
                </div>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}

/* ----------------------------------------------------------------- tasks */

const STATUS_TINT: Record<string, string> = { backlog: "var(--ink-3)", todo: "var(--c1)", doing: "var(--warn)", done: "var(--good)" };

/** Tasks by status. `projectId` = one project's board (new cards go to that project). */
export function TaskBoard({ tasks, projectId }: { tasks: TaskDTO[]; projectId?: string }) {
  const { openTask } = useWork();
  const items = tasks.map((t) => ({ ...t, column: t.status }));
  return (
    <Board
      columns={TASK_STATUSES}
      items={items}
      columnTint={(c) => STATUS_TINT[c]}
      onMove={(id, col, index) => moveTask(id, col, index, projectId)}
      renderCard={(t) => (
        <div
          role="button"
          tabIndex={0}
          onClick={() => openTask(t)}
          onKeyDown={(e) => e.key === "Enter" && openTask(t)}
          className="flex items-start gap-2.5 rounded-[12px] border border-hairline bg-surface px-3 py-2.5 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lift)]"
        >
          <div className="pt-[1px]">
            <TaskCheck task={t} size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[13.5px] leading-snug ${t.status === "done" ? "text-ink-3 line-through" : ""}`}>{t.title}</div>
            <TaskMeta task={t} showProject={!projectId} />
          </div>
        </div>
      )}
      footer={(col) => (col === "done" ? null : <QuickAdd projectId={projectId ?? null} status={col} placeholder="Add" />)}
    />
  );
}

export function OpenInNotion({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary">
      <NotionMark size={14} /> Open in Notion <ExternalLink size={12} className="text-ink-3" />
    </a>
  );
}
