"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarClock, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import { busyDays, firstOfMonth, monthWeeks, type DayItem } from "@/lib/calendar-month";
import { eventsOnDay, itemTime } from "@/lib/calendar-month";
import { formatClock, formatDay, minutesInTz, ymdInTz } from "@/lib/dates";
import type { EventDTO, TaskDTO } from "@/lib/data";
import { flagDate, groupTasks } from "@/lib/tasks";
import { MiniMonth, textOn } from "./CalendarPanels";
import { QuickAdd, TagChip, TaskCheck, TASKS_CHANGED } from "./TaskBits";
import { useWork } from "./TaskSheet";

const OPEN_KEY = "lw:right-panel";
const SECTIONS_KEY = "lw:right-panel-sections";
export const PANEL_WIDTH = 316; // px, open
const RAIL_WIDTH = 44; // px, collapsed

type Ctx = { shown: boolean; open: boolean; setOpen: (v: boolean) => void };
const PanelContext = createContext<Ctx>({ shown: false, open: false, setOpen: () => {} });
export const usePanel = () => useContext(PanelContext);

/**
 * The right-hand panel (wide screens): mini month, the selected day's events and tasks, then every open task in an
 * accordion. Open by default, can be collapsed to a thin rail (remembered per device). Not shown where the page has
 * its own agenda (Calendar, Tasks → List). The space it takes is exposed as `--rp` on <html>, so the page and the
 * habit dock make room for it.
 */
export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const params = useSearchParams();
  // Not where the page has its own agenda / side column: Calendar, Tasks → List, Notes (Notion-like, its own sidebar).
  // Today has its own right column (deadlines, agenda, activity).
  const shown = !(path === "/" || path.startsWith("/calendar") || path.startsWith("/notes") || (path.startsWith("/tasks") && params.get("view") === "list"));
  const [open, setOpenState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "0") setOpenState(false);
    } catch {
      /* private mode */
    }
  }, []);
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--rp", shown ? `${open ? PANEL_WIDTH : RAIL_WIDTH}px` : "0px");
  }, [shown, open]);
  const value = useMemo(() => ({ shown, open, setOpen }), [shown, open, setOpen]);
  return (
    <PanelContext.Provider value={value}>
      {children}
      {shown && <RightPanel />}
    </PanelContext.Provider>
  );
}

type PanelData = { month: string; weekStart: number; events: EventDTO[]; tasks: TaskDTO[] };

function RightPanel() {
  const { open, setOpen } = usePanel();
  const { tz, today, openTask, projects } = useWork();
  const path = usePathname();
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [sel, setSel] = useState(today);
  const [data, setData] = useState<PanelData | null>(null);
  const [tick, setTick] = useState(0);

  // Fresh data when the month changes, on navigation, when the window comes back into focus, and every minute.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/panel?month=${month.slice(0, 7)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PanelData | null) => alive && d && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [month, path, tick, open]);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    const i = setInterval(again, 60_000);
    window.addEventListener("focus", again);
    window.addEventListener(TASKS_CHANGED, again);
    return () => (clearInterval(i), window.removeEventListener("focus", again), window.removeEventListener(TASKS_CHANGED, again));
  }, []);

  if (!open)
    return (
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-11 flex-col items-center border-l border-hairline bg-[var(--card-bg)] pt-5 backdrop-blur-xl xl:flex">
        <button className="icon-btn !h-8 !w-8" onClick={() => setOpen(true)} aria-label="Show the agenda panel" title="Show agenda & tasks">
          <PanelRightOpen size={16} />
        </button>
      </aside>
    );

  const events = data?.events ?? [];
  const tasks = data?.tasks ?? [];
  const weekStart = data?.weekStart ?? 0;
  const busy = busyDays(events, monthWeeks(month, weekStart, true).flat(), tz);
  const items: DayItem<EventDTO>[] = eventsOnDay(events, sel, tz);
  const dayTasks = tasks.filter((t) => t.status !== "done" && (t.scheduledStart ? ymdInTz(new Date(t.scheduledStart), tz) === sel : t.dueDate === sel));
  const g = groupTasks(
    tasks.filter((t) => t.status !== "done"),
    today,
    tz,
  );

  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden flex-col border-l border-hairline bg-[var(--card-bg)] backdrop-blur-xl xl:flex" style={{ width: PANEL_WIDTH }} aria-label="Agenda and tasks">
      <div className="flex items-center gap-2 px-4 pb-1 pt-5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Agenda & tasks</span>
        <button className="icon-btn ml-auto !h-7 !w-7" onClick={() => setOpen(false)} aria-label="Collapse the panel" title="Collapse">
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <div className="pt-2">
          <MiniMonth month={month} onMonth={setMonth} selected={sel} today={today} weekStart={weekStart} busy={busy} onPick={(d) => (setSel(d), d.slice(0, 7) !== month.slice(0, 7) && setMonth(firstOfMonth(d)))} />
        </div>

        {/* the selected day */}
        <section className="mt-3 border-t border-hairline pt-3">
          <h3 className="flex items-baseline justify-between px-1 pb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${sel === today ? "text-bad" : "text-ink-2"}`}>{sel === today ? "Today" : formatDay(sel).split(",")[0]}</span>
            <Link href={`/calendar?view=day&date=${sel}`} className="text-[11.5px] text-ink-3 hover:text-ink">
              {formatDay(sel)} ›
            </Link>
          </h3>
          {!data ? (
            <p className="px-1 py-2 text-[12.5px] text-ink-3">Loading…</p>
          ) : (
            <div className="space-y-px">
              {items.map((it) =>
                it.event.allDay ? (
                  <div key={it.event.id} className="mx-0.5 truncate rounded-[6px] px-2 py-[3px] text-[12px] font-medium" style={{ background: it.event.color, color: textOn(it.event.color) }}>
                    {it.event.title}
                  </div>
                ) : (
                  <a
                    key={it.event.id}
                    href={it.event.meetLink ?? it.event.htmlLink ?? `/calendar?view=day&date=${sel}`}
                    target={it.event.meetLink || it.event.htmlLink ? "_blank" : undefined}
                    rel="noreferrer"
                    className={`flex items-start gap-2 rounded-[8px] px-1.5 py-1 hover:bg-surface-2 ${it.event.declined ? "opacity-55" : ""}`}
                  >
                    <span className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: it.event.color }} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-medium ${it.event.declined ? "line-through" : ""}`}>{it.event.title}</span>
                      <span className="num block text-[11.5px] text-ink-3">{itemTime(it)}</span>
                    </span>
                  </a>
                ),
              )}
              {dayTasks.map((t) => (
                <div key={t.id} data-task className="flex items-start gap-2 rounded-[8px] px-1.5 py-1 hover:bg-surface-2">
                  <span className="pt-[2px]">
                    <TaskCheck task={t} size={14} />
                  </span>
                  <button type="button" onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
                    <span className="task-title block truncate text-[13px]">{t.title}</span>
                    {t.scheduledStart && (
                      <span className="num inline-flex items-center gap-1 text-[11.5px] text-accent">
                        <CalendarClock size={11} /> {formatClock(minutesInTz(new Date(t.scheduledStart), tz))}
                      </span>
                    )}
                  </button>
                </div>
              ))}
              {!items.length && !dayTasks.length && <p className="px-1.5 py-1 text-[12.5px] text-ink-3">Nothing on this day.</p>}
            </div>
          )}
        </section>

        {/* every open task, folded by group */}
        <section className="mt-4 border-t border-hairline pt-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Tasks</span>
            <Link href="/tasks?view=list" className="text-[11.5px] text-ink-3 hover:text-ink">
              All ›
            </Link>
          </div>
          <div className="mb-2">
            <QuickAdd placeholder="Add a task…" />
          </div>
          <Accordion
            groups={[
              { key: "overdue", label: "Overdue", tasks: g.overdue, tone: "text-bad" },
              { key: "today", label: "Today", tasks: g.today },
              { key: "upcoming", label: "Upcoming", tasks: g.upcoming },
              { key: "inbox", label: "No date", tasks: g.inbox },
            ]}
            today={today}
            onOpen={openTask}
            projects={projects}
          />
        </section>
      </div>
    </aside>
  );
}

function Accordion({
  groups,
  today,
  onOpen,
  projects,
}: {
  groups: { key: string; label: string; tasks: TaskDTO[]; tone?: string }[];
  today: string;
  onOpen: (t: TaskDTO) => void;
  projects: { id: string; name: string; emoji: string | null }[];
}) {
  // Open groups, remembered per device (Overdue and Today open the first time).
  const [openKeys, setOpenKeys] = useState<string[]>(["overdue", "today"]);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "null");
      if (Array.isArray(s)) setOpenKeys(s);
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = (k: string) =>
    setOpenKeys((cur) => {
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  return (
    <div className="space-y-1">
      {groups.map((g) => {
        const isOpen = openKeys.includes(g.key);
        return (
          <div key={g.key} className="rounded-[10px] bg-surface-2/60">
            <button type="button" onClick={() => toggle(g.key)} aria-expanded={isOpen} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[12.5px] font-semibold">
              <ChevronRight size={13} className={`text-ink-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              <span className={g.tone ?? ""}>{g.label}</span>
              <span className="num ml-auto text-[11.5px] font-normal text-ink-3">{g.tasks.length}</span>
            </button>
            {isOpen && (
              <div className="pb-1">
                {g.tasks.map((t) => {
                  const p = t.projectId ? projects.find((x) => x.id === t.projectId) : null;
                  return (
                    <div key={t.id} data-task className="flex items-start gap-2 px-2 py-[5px] hover:bg-surface-2">
                      <span className="pt-[2px]">
                        <TaskCheck task={t} size={14} />
                      </span>
                      <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                        <span className="task-title block truncate text-[13px]">{t.title}</span>
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-ink-3">
                          {p && <span className="truncate">{p.emoji ? `${p.emoji} ` : ""}{p.name}</span>}
                          {t.dueDate && <span className={`num ${t.dueDate < today ? "text-bad" : ""}`}>{flagDate(t.dueDate, today)}</span>}
                          {t.tags.slice(0, 2).map((tag) => (
                            <TagChip key={tag} tag={tag} />
                          ))}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {!g.tasks.length && <p className="px-3 py-1 text-[12px] text-ink-3">Nothing here.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
