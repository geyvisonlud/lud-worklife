"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckSquare,
  EyeOff,
  ExternalLink,
  Flag,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  addColumn,
  deleteColumn,
  deleteTask,
  moveColumn,
  moveProject,
  moveTask,
  updateColumn,
  type ActionResult,
} from "@/app/actions";
import { PROJECT_COLORS, projectColor } from "@/lib/colors";
import {
  checklist,
  cardDescription,
  positionAt,
  type Board as BoardKind,
  type BoardColumnDTO,
} from "@/lib/kanban";
import {
  EMPTY_FILTER,
  filterBoardTasks,
  flagDate,
  type BoardFilter,
} from "@/lib/tasks";
import type { ProjectDTO, TaskDTO } from "@/lib/data";
import { ProjectSheet } from "./ProjectSheet";
import { QuickAdd, TaskCheck } from "./TaskBits";
import { useReport, useWork } from "./TaskSheet";
import { NotionMark, columnColor, notionReasonLabel } from "./ui";

type Item = { id: string; column: string; position: number };

const SHOW = 6; // cards shown per column before "Show N more"

/**
 * Generic Kanban: lanes with a header (color, name, count, menu), "+ Add" at the top, cards dragged between and within
 * lanes (HTML5 drag and drop), "Show N more", and "+ Add column" at the end. Moves show instantly and are saved in the
 * background; a failed save puts the card back. On phones, a card's ⋯ menu moves it to another column.
 */
function Board<T extends Item>({
  board,
  columns,
  items,
  onMove,
  renderCard,
  addLabel,
  onAdd,
  addForm,
  manualOrder = true,
}: {
  board: BoardKind;
  columns: BoardColumnDTO[];
  items: T[];
  onMove: (id: string, column: string, index: number) => Promise<ActionResult>;
  renderCard: (
    item: T,
    ctx: { columns: BoardColumnDTO[]; move: (column: string) => void },
  ) => React.ReactNode;
  addLabel: string;
  /** "+ Add" button (when there's no inline form). */
  onAdd?: (column: string) => void;
  /** Inline add form shown under the button. */
  addForm?: (column: string, close: () => void) => React.ReactNode;
  /** false when the toolbar sorts the cards: they still move between columns, but keep the sort. */
  manualOrder?: boolean;
}) {
  const report = useReport();
  const [local, setLocal] = useState(items);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: string; index: number } | null>(
    null,
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const colRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => setLocal(items), [items]);

  const visible = columns.filter((c) => !c.hidden);
  const hidden = columns.filter((c) => c.hidden);
  const order = new Map(items.map((i, n) => [i.id, n]));
  const byColumn = (col: string) =>
    local
      .filter((i) => i.column === col)
      .sort((a, b) =>
        manualOrder
          ? a.position - b.position
          : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );

  const indexAt = (col: string, clientY: number) => {
    const el = colRefs.current[col];
    if (!el) return 0;
    const cards = [...el.querySelectorAll<HTMLElement>("[data-card]")].filter(
      (c) => c.dataset.card !== drag,
    );
    const i = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  };

  const moveTo = (id: string, col: string, index: number) => {
    const moving = local.find((i) => i.id === id);
    if (!moving) return;
    const others = byColumn(col).filter((i) => i.id !== id);
    const position = positionAt(others, index);
    if (moving.column === col && Math.abs(moving.position - position) < 1e-9)
      return;
    const before = local;
    setLocal(
      local.map((i) => (i.id === id ? { ...i, column: col, position } : i)),
    );
    start(async () => {
      if (!report(await onMove(id, col, index))) setLocal(before);
    });
  };
  const drop = (col: string, index: number) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    if (id) moveTo(id, col, index);
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0 [scrollbar-width:thin]">
      <div className="flex snap-x snap-mandatory items-start gap-3 md:snap-none">
        {visible.map((c, ci) => {
          const all = byColumn(c.key);
          const isOver = over?.column === c.key;
          const open = expanded.has(c.key) || drag !== null;
          const cards = open ? all : all.slice(0, SHOW);
          return (
            <section
              key={c.key}
              ref={(el) => {
                colRefs.current[c.key] = el;
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const index = indexAt(c.key, e.clientY);
                if (over?.column !== c.key || over.index !== index)
                  setOver({ column: c.key, index });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setOver((o) => (o?.column === c.key ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(c.key, indexAt(c.key, e.clientY));
              }}
              className={`flex w-[84vw] max-w-[310px] shrink-0 snap-start flex-col rounded-[14px] border p-1.5 transition-colors sm:w-[300px] ${
                isOver
                  ? "border-accent bg-accent-soft"
                  : "border-hairline bg-surface-2/70"
              }`}
              aria-label={c.label}
            >
              <ColumnHeader
                board={board}
                column={c}
                count={all.length}
                first={ci === 0}
                last={ci === visible.length - 1}
                index={ci}
              />
              <button
                className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-hairline bg-surface py-[7px] text-[13px] font-medium text-ink-2 shadow-[var(--shadow)] transition-colors hover:text-ink"
                onClick={() =>
                  addForm
                    ? setAdding(adding === c.key ? null : c.key)
                    : onAdd?.(c.key)
                }
              >
                <Plus size={14} /> {addLabel}
              </button>
              {adding === c.key && addForm && (
                <div className="mb-1.5">
                  {addForm(c.key, () => setAdding(null))}
                </div>
              )}
              <div className="flex min-h-[64px] flex-1 flex-col gap-1.5">
                {cards.map((item, i) => (
                  <div key={item.id}>
                    {isOver &&
                      item.id !== drag &&
                      over.index ===
                        cards.slice(0, i).filter((x) => x.id !== drag)
                          .length && <DropLine />}
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
                      {renderCard(item, {
                        columns: visible,
                        move: (col) => moveTo(item.id, col, 0),
                      })}
                    </div>
                  </div>
                ))}
                {isOver &&
                  over.index >= cards.filter((x) => x.id !== drag).length && (
                    <DropLine />
                  )}
                {!all.length && !isOver && (
                  <p className="py-5 text-center text-[12.5px] text-ink-3">
                    Drop cards here
                  </p>
                )}
                {all.length > SHOW && !drag && (
                  <button
                    className="rounded-[8px] py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-surface hover:text-ink"
                    onClick={() =>
                      setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(c.key)) n.delete(c.key);
                        else n.add(c.key);
                        return n;
                      })
                    }
                  >
                    {expanded.has(c.key)
                      ? "Show less"
                      : `Show ${all.length - SHOW} more`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
        <AddColumn board={board} hidden={hidden} />
      </div>
    </div>
  );
}

const DropLine = () => (
  <div className="mx-1 my-0.5 h-[3px] rounded-full bg-accent" aria-hidden />
);

/* -------------------------------------------------------------- columns */

function ColumnHeader({
  board,
  column: c,
  count,
  first,
  last,
  index,
}: {
  board: BoardKind;
  column: BoardColumnDTO;
  count: number;
  first: boolean;
  last: boolean;
  index: number;
}) {
  const report = useReport();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.label);
  const [confirm, setConfirm] = useState(false);
  const [, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setMenu(false);
      if (report(await fn())) router.refresh();
    });

  return (
    <div className="relative flex items-center gap-2 px-2 pb-2 pt-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: columnColor(c.color) }}
        aria-hidden
      />
      {renaming ? (
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setRenaming(false);
            if (name.trim() && name !== c.label)
              run(() => updateColumn(board, c.key, { label: name }));
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            className="input !py-0.5 !text-[13.5px]"
            aria-label="Column name"
            maxLength={40}
          />
        </form>
      ) : (
        <h3
          className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em]"
          onDoubleClick={() => setRenaming(true)}
        >
          {c.label}
        </h3>
      )}
      <span className="num rounded-full bg-surface px-1.5 text-[11.5px] text-ink-3">
        {count}
      </span>
      <button
        className="ml-auto rounded-[6px] p-1 text-ink-3 hover:bg-surface hover:text-ink"
        onClick={() => setMenu(!menu)}
        aria-label={`${c.label} column options`}
        aria-expanded={menu}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => (setMenu(false), setConfirm(false))}
            aria-hidden
          />
          <div
            className="absolute right-1 top-9 z-30 w-[210px] rounded-[12px] border border-hairline bg-surface p-1.5 text-[13px] shadow-[var(--shadow-lift)]"
            role="menu"
          >
            <MenuItem
              icon={<Pencil size={13} />}
              onClick={() => (setMenu(false), setRenaming(true))}
            >
              Rename
            </MenuItem>
            <div
              className="flex flex-wrap gap-1.5 px-2 py-1.5"
              role="group"
              aria-label="Color"
            >
              {["gray", ...Object.keys(PROJECT_COLORS)].map((k) => (
                <button
                  key={k}
                  aria-label={k}
                  aria-pressed={c.color === k}
                  onClick={() =>
                    run(() => updateColumn(board, c.key, { color: k }))
                  }
                  className="h-[18px] w-[18px] rounded-full"
                  style={{
                    background: columnColor(k),
                    boxShadow:
                      c.color === k
                        ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${columnColor(k)}`
                        : undefined,
                  }}
                />
              ))}
            </div>
            <div className="my-1 border-t border-hairline" />
            {!first && (
              <MenuItem
                icon={<ArrowLeft size={13} />}
                onClick={() => run(() => moveColumn(board, c.key, index - 1))}
              >
                Move left
              </MenuItem>
            )}
            {!last && (
              <MenuItem
                icon={<ArrowRight size={13} />}
                onClick={() => run(() => moveColumn(board, c.key, index + 1))}
              >
                Move right
              </MenuItem>
            )}
            {c.builtIn ? (
              c.key !== "done" && (
                <MenuItem
                  icon={<EyeOff size={13} />}
                  onClick={() =>
                    run(() => updateColumn(board, c.key, { hidden: true }))
                  }
                >
                  Hide column
                </MenuItem>
              )
            ) : confirm ? (
              <MenuItem
                icon={<Trash2 size={13} />}
                danger
                onClick={() => run(() => deleteColumn(board, c.key))}
              >
                {count
                  ? `Delete — ${count} card${count === 1 ? "" : "s"} move`
                  : "Delete for good"}
              </MenuItem>
            ) : (
              <MenuItem
                icon={<Trash2 size={13} />}
                danger
                onClick={() => setConfirm(true)}
              >
                Delete column
              </MenuItem>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2 ${danger ? "text-bad" : ""}`}
    >
      <span className={danger ? "" : "text-ink-3"}>{icon}</span>
      {children}
    </button>
  );
}

/** The last lane: "+ Add column" (inline name) and the hidden columns, to show them again. */
function AddColumn({
  board,
  hidden,
}: {
  board: BoardKind;
  hidden: BoardColumnDTO[];
}) {
  const report = useReport();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => {
    const n = name?.trim();
    setName(null);
    if (n)
      start(
        async () =>
          void (report(await addColumn(board, n)) && router.refresh()),
      );
  };
  return (
    <div className="w-[240px] shrink-0 space-y-2">
      {name === null ? (
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-hairline-strong py-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          onClick={() => setName("")}
          disabled={pending}
        >
          <Plus size={14} /> Add column
        </button>
      ) : (
        <form
          className="rounded-[14px] border border-hairline bg-surface p-2"
          onSubmit={(e) => (e.preventDefault(), save())}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setName(null)}
            onBlur={save}
            placeholder="Column name (e.g. Blocked)"
            className="input !text-[13.5px]"
            maxLength={40}
            aria-label="New column name"
          />
        </form>
      )}
      {hidden.length > 0 && (
        <div className="rounded-[14px] border border-hairline p-2">
          <div className="px-1 pb-1 text-[11.5px] font-medium text-ink-3">
            Hidden columns
          </div>
          {hidden.map((c) => (
            <button
              key={c.key}
              className="flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              onClick={() =>
                start(
                  async () =>
                    void (
                      report(
                        await updateColumn(board, c.key, { hidden: false }),
                      ) && router.refresh()
                    ),
                )
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: columnColor(c.color) }}
              />
              {c.label}
              <span className="ml-auto text-[11.5px] text-accent">Show</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ card bits */

const PRIORITY: Record<number, { label: string; cls: string }> = {
  3: { label: "High", cls: "bg-bad-soft text-bad" },
  2: { label: "Medium", cls: "bg-warn-soft text-warn" },
  1: { label: "Low", cls: "bg-good-soft text-good" },
};

/** Segmented progress (one segment per checklist item / up to 10 tasks), like the reference board. */
function Segments({
  done,
  total,
  color,
}: {
  done: number;
  total: number;
  color: string;
}) {
  if (!total) return null;
  const n = Math.min(total, 10);
  const filled = Math.round((done / total) * n);
  return (
    <div className="mt-2.5 flex gap-1" aria-label={`${done} of ${total} done`}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="h-[4px] flex-1 rounded-full"
          style={{ background: i < filled ? color : "var(--surface-3)" }}
        />
      ))}
    </div>
  );
}

function DueFlag({ day, done }: { day: string; done: boolean }) {
  const { today } = useWork();
  const late = !done && day < today;
  const soon = !done && (day === today || flagDate(day, today) === "Tomorrow");
  return (
    <span
      className={`num inline-flex items-center gap-1 text-[12px] ${late ? "font-medium text-bad" : soon ? "font-medium text-warn" : "text-ink-2"}`}
    >
      <Flag size={12} /> {flagDate(day, today)}
    </span>
  );
}

/** ⋯ on a card: move to another column (handy on phones, where dragging doesn't work), plus extras. */
function CardMenu({
  columns,
  current,
  onMove,
  extra,
}: {
  columns: BoardColumnDTO[];
  current: string;
  onMove: (col: string) => void;
  extra?: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        className="rounded-[6px] p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
        onClick={() => setOpen(!open)}
        aria-label="Card options"
        aria-expanded={open}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 top-6 z-30 w-[190px] rounded-[12px] border border-hairline bg-surface p-1.5 text-[13px] shadow-[var(--shadow-lift)]"
            role="menu"
          >
            <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-ink-3">
              Move to
            </div>
            {columns.map((c) => (
              <button
                key={c.key}
                role="menuitem"
                disabled={c.key === current}
                onClick={() => (setOpen(false), onMove(c.key))}
                className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-100"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: columnColor(c.color) }}
                />
                <span className={c.key === current ? "font-medium" : ""}>
                  {c.label}
                </span>
                {c.key === current && (
                  <Check size={13} className="ml-auto text-ink-3" />
                )}
              </button>
            ))}
            {extra && (
              <div className="mt-1 border-t border-hairline pt-1">
                {extra(() => setOpen(false))}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}

/* -------------------------------------------------------------- projects */

export function ProjectBoard({ projects }: { projects: ProjectDTO[] }) {
  const router = useRouter();
  const { projectColumns } = useWork();
  const [newIn, setNewIn] = useState<string | null>(null);
  const items = projects.map((p) => ({ ...p, column: p.stage }));
  return (
    <>
      <Board
        board="projects"
        columns={projectColumns}
        items={items}
        addLabel="Add project"
        onAdd={setNewIn}
        onMove={(id, col, index) => moveProject(id, col, index)}
        renderCard={(p, { columns, move }) => {
          const c = projectColor(p.color);
          return (
            <div
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/projects/${p.id}`)}
              onKeyDown={(e) =>
                e.key === "Enter" && router.push(`/projects/${p.id}`)
              }
              className="rounded-[12px] border border-hairline bg-surface p-3 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[15px]"
                  style={{
                    background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                  }}
                  aria-hidden
                >
                  {p.emoji ?? ""}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">
                    {p.name}
                  </div>
                  {(p.notionParent || p.source === "notion") && (
                    <div className="flex min-w-0 items-center gap-1 truncate text-[11.5px] text-ink-3">
                      <NotionMark size={10} />{" "}
                      {p.notionParent ?? notionReasonLabel(p.notionReason)}
                    </div>
                  )}
                </div>
                <CardMenu columns={columns} current={p.column} onMove={move} />
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-ink-2">
                  {p.description}
                </p>
              )}
              <Segments done={p.doneCount} total={p.taskCount} color={c.hex} />
              <div className="mt-2.5 flex items-center gap-3 text-[12px] text-ink-2">
                {p.taskCount > 0 ? (
                  <span className="num inline-flex items-center gap-1">
                    <CheckSquare size={12} /> {p.doneCount}/{p.taskCount}
                  </span>
                ) : (
                  <span className="text-ink-3">No tasks yet</span>
                )}
                <span className="ml-auto">
                  {p.dueDate && (
                    <DueFlag day={p.dueDate} done={p.column === "done"} />
                  )}
                </span>
              </div>
            </div>
          );
        }}
      />
      <ProjectSheet
        open={newIn !== null}
        stage={newIn ?? undefined}
        onClose={() => setNewIn(null)}
      />
    </>
  );
}

/* ----------------------------------------------------------------- tasks */

/** A task card: priority, project, title, description, checklist progress, time block and due flag. */
function TaskCard({
  t,
  columns,
  move,
  showProject,
}: {
  t: TaskDTO & { column: string };
  columns: BoardColumnDTO[];
  move: (col: string) => void;
  showProject: boolean;
}) {
  const { projects, openTask } = useWork();
  const report = useReport();
  const [, start] = useTransition();
  const p =
    showProject && t.projectId
      ? projects.find((x) => x.id === t.projectId)
      : null;
  const pr = PRIORITY[t.priority];
  const list = checklist(t.notes);
  const desc = cardDescription(t.notes);
  const done = t.status === "done";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(t)}
      onKeyDown={(e) => e.key === "Enter" && openTask(t)}
      className="relative rounded-[12px] border border-hairline bg-surface p-3 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lift)]"
    >
      {(pr || t.fromGoogleTasks || t.fromNotion) && (
        <div className="mb-1.5 flex items-center gap-1.5 pr-6">
          {pr && (
            <span
              className={`rounded-[6px] px-1.5 py-[1px] text-[11.5px] font-medium ${pr.cls}`}
            >
              {pr.label}
            </span>
          )}
          {t.fromGoogleTasks && (
            <span className="rounded-[6px] border border-hairline px-1.5 py-[1px] text-[11px] text-ink-2">
              Google Tasks
            </span>
          )}
          {t.fromNotion && (
            <span className="inline-flex items-center gap-1 rounded-[6px] border border-hairline px-1.5 py-[1px] text-[11px] text-ink-2">
              <NotionMark size={10} /> Notion
            </span>
          )}
        </div>
      )}
      <span className="absolute right-2 top-2.5">
        <CardMenu
          columns={columns}
          current={t.column}
          onMove={move}
          extra={(close) => (
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-bad hover:bg-surface-2"
              onClick={() => (
                close(),
                start(async () => void report(await deleteTask(t.id)))
              )}
            >
              <Trash2 size={13} /> Delete task
            </button>
          )}
        />
      </span>
      {p && (
        <div className="mb-1 flex min-w-0 items-center gap-1.5 pr-6 text-[12px] text-ink-2">
          {p.emoji ? (
            <span className="text-[12px] leading-none" aria-hidden>
              {p.emoji}
            </span>
          ) : (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: projectColor(p.color).hex }}
              aria-hidden
            />
          )}
          <span
            className="truncate"
            style={{
              color: `color-mix(in srgb, ${projectColor(p.color).hex} 70%, var(--ink))`,
            }}
          >
            {p.name}
          </span>
        </div>
      )}
      <div
        className={`flex items-start gap-2 ${!p && !pr && !t.fromGoogleTasks && !t.fromNotion ? "pr-6" : ""}`}
      >
        <span className="pt-[2px]" onClick={(e) => e.stopPropagation()}>
          <TaskCheck task={t} size={15} />
        </span>
        <div
          className={`min-w-0 text-[14px] font-semibold leading-snug tracking-[-0.01em] ${done ? "text-ink-3 line-through" : ""}`}
        >
          {t.title}
        </div>
      </div>
      {desc && (
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-2">
          {desc}
        </p>
      )}
      <Segments
        done={list.done}
        total={list.total}
        color={p ? projectColor(p.color).hex : "var(--good)"}
      />
      {(list.total > 0 || t.scheduledStart || t.dueDate) && (
        <div className="mt-2.5 flex items-center gap-3 text-[12px] text-ink-2">
          {list.total > 0 && (
            <span
              className={`num inline-flex items-center gap-1 ${list.done === list.total ? "text-good" : ""}`}
            >
              <CheckSquare size={12} /> {list.done}/{list.total}
            </span>
          )}
          {t.scheduledStart && (
            <span
              className="inline-flex items-center gap-1"
              title="On your calendar"
            >
              <CalendarClock size={12} />
            </span>
          )}
          <span className="ml-auto">
            {t.dueDate && <DueFlag day={t.dueDate} done={done} />}
          </span>
        </div>
      )}
    </div>
  );
}

/** Tasks by status column. `projectId` = one project's board (new cards go to that project). */
export function TaskBoard({
  tasks,
  projectId,
  filter = EMPTY_FILTER,
}: {
  tasks: TaskDTO[];
  projectId?: string;
  filter?: BoardFilter;
}) {
  const { taskColumns, today, projects } = useWork();
  const shown = useMemo(
    () =>
      filterBoardTasks(
        tasks,
        filter,
        today,
        (id) => projects.find((p) => p.id === id)?.name ?? "",
      ),
    [tasks, filter, today, projects],
  );
  const items = shown.map((t) => ({ ...t, column: t.status }));
  return (
    <Board
      board="tasks"
      columns={taskColumns}
      items={items}
      manualOrder={filter.sort === "manual"}
      addLabel="Add task"
      addForm={(col) => (
        <QuickAdd
          projectId={
            projectId ??
            (filter.project && filter.project !== "none"
              ? filter.project
              : null)
          }
          status={col}
          placeholder="Task name…"
        />
      )}
      onMove={(id, col, index) => moveTask(id, col, index, projectId)}
      renderCard={(t, { columns, move }) => (
        <TaskCard
          t={t}
          columns={columns}
          move={move}
          showProject={!projectId}
        />
      )}
    />
  );
}

/* ----------------------------------------------------------- toolbar */

/** Search + filters + sort above the task board (all client-side). */
export function BoardToolbar({
  filter,
  onChange,
  count,
  showProject = true,
}: {
  filter: BoardFilter;
  onChange: (f: BoardFilter) => void;
  count: number;
  showProject?: boolean;
}) {
  const { projects } = useWork();
  const set = (patch: Partial<BoardFilter>) =>
    onChange({ ...filter, ...patch });
  const active =
    filter.q ||
    filter.priority ||
    filter.project ||
    filter.due ||
    filter.sort !== "manual";
  return (
    <div className="animate-in mb-4 flex flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-[220px]">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          type="search"
          value={filter.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="input !rounded-[9px] !py-[7px] !pl-8 !text-[13px]"
        />
      </label>
      <Select
        label="Priority"
        value={filter.priority}
        onChange={(v) => set({ priority: v })}
        options={[
          ["", "Any"],
          ["3", "High"],
          ["2", "Medium"],
          ["1", "Low"],
          ["0", "None"],
        ]}
      />
      <Select
        label="Due"
        value={filter.due}
        onChange={(v) => set({ due: v as BoardFilter["due"] })}
        options={[
          ["", "Any time"],
          ["overdue", "Overdue"],
          ["today", "Today"],
          ["week", "This week"],
          ["none", "No date"],
        ]}
      />
      {showProject && (
        <Select
          label="Project"
          value={filter.project}
          onChange={(v) => set({ project: v })}
          options={[
            ["", "All projects"],
            ["none", "No project"],
            ...projects.map(
              (p) =>
                [p.id, `${p.emoji ? `${p.emoji} ` : ""}${p.name}`] as [
                  string,
                  string,
                ],
            ),
          ]}
        />
      )}
      <Select
        label="Sort"
        value={filter.sort}
        onChange={(v) => set({ sort: v as BoardFilter["sort"] })}
        options={[
          ["manual", "Manual order"],
          ["due", "Due date"],
          ["priority", "Priority"],
        ]}
      />
      {active && (
        <button
          className="inline-flex items-center gap-1 rounded-[9px] px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          onClick={() => onChange(EMPTY_FILTER)}
        >
          <X size={13} /> Clear
        </button>
      )}
      <span className="num ml-auto hidden text-[12.5px] text-ink-3 sm:inline">
        {count} tasks
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const current = options.find(([v]) => v === value)?.[1] ?? options[0][1];
  return (
    <label
      className={`relative inline-flex items-center gap-1 rounded-[9px] border px-2.5 py-[6px] text-[13px] ${value && value !== "manual" ? "border-ink/30 bg-surface-2" : "border-hairline bg-surface"}`}
    >
      <span className="text-ink-3">{label}:</span>
      <span className="max-w-[150px] truncate font-medium">{current}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tasks page board: toolbar + board with the filters kept in the URL-free client state. */
export function TaskBoardView({
  tasks,
  projectId,
  initialProject,
}: {
  tasks: TaskDTO[];
  projectId?: string;
  initialProject?: string;
}) {
  const [filter, setFilter] = useState<BoardFilter>({
    ...EMPTY_FILTER,
    project: initialProject ?? "",
  });
  const { today, projects } = useWork();
  const count = filterBoardTasks(
    tasks,
    filter,
    today,
    (id) => projects.find((p) => p.id === id)?.name ?? "",
  ).length;
  return (
    <>
      <BoardToolbar
        filter={filter}
        onChange={setFilter}
        count={count}
        showProject={!projectId}
      />
      <TaskBoard tasks={tasks} projectId={projectId} filter={filter} />
    </>
  );
}

export function OpenInNotion({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="btn btn-secondary"
    >
      <NotionMark size={14} /> Open in Notion{" "}
      <ExternalLink size={12} className="text-ink-3" />
    </a>
  );
}
