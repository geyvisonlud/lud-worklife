"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { createHabit, deleteHabit, setHabitArchived, setHabitDone, updateHabit } from "@/app/actions";
import { PROJECT_COLORS, projectColor } from "@/lib/colors";
import { formatDay } from "@/lib/dates";
import { goalLabel, isDaily, type Cell, type HabitSummary } from "@/lib/habits";
import { Field, Sheet } from "./Sheet";
import { useReport, useWork } from "./TaskSheet";

/* ------------------------------------------------------------- checklist */

/** Keeps a local copy so ticks show instantly; rolls back if saving fails. */
function useHabitList(initial: HabitSummary[]) {
  const { today } = useWork();
  const report = useReport();
  const [list, setList] = useState(initial);
  const [, start] = useTransition();
  useEffect(() => setList(initial), [initial]);
  const toggle = (id: string) => {
    const h = list.find((x) => x.id === id);
    if (!h) return;
    const next = !h.doneToday;
    const before = list;
    // Optimistic: a daily habit's streak grows or shrinks by one; weekly ones refresh from the server.
    setList((l) =>
      l.map((x) =>
        x.id === id ? { ...x, doneToday: next, thisWeek: x.thisWeek + (next ? 1 : -1), streak: isDaily(x.targetPerWeek) ? Math.max(0, x.streak + (next ? 1 : -1)) : x.streak } : x,
      ),
    );
    start(async () => {
      if (!report(await setHabitDone(id, today, next))) setList(before);
    });
  };
  return { list, toggle };
}

export function HabitCheck({ done, color, size = 26, label, onClick }: { done: boolean; color: string; size?: number; label: string; onClick: () => void }) {
  const c = projectColor(color).hex;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
      className="group/hc inline-flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
      style={{ width: size, height: size, background: done ? c : `color-mix(in srgb, ${c} 9%, transparent)`, boxShadow: done ? "none" : `inset 0 0 0 1.8px color-mix(in srgb, ${c} 70%, transparent)` }}
    >
      <svg viewBox="0 0 16 16" width={size * 0.55} height={size * 0.55} aria-hidden className={done ? "text-white" : "opacity-0 group-hover/hc:opacity-60"} style={done ? {} : { color: c }}>
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function HabitRow({ h, onToggle, compact }: { h: HabitSummary; onToggle: () => void; compact?: boolean }) {
  return (
    <li className={`list-row flex items-center gap-3 ${compact ? "py-1.5" : "py-2.5"}`}>
      <HabitCheck done={h.doneToday} color={h.color} size={compact ? 22 : 26} label={`${h.doneToday ? "Undo" : "Done"}: ${h.name}`} onClick={onToggle} />
      <Link href={`/habits/${h.id}`} className="min-w-0 flex-1">
        <div className={`truncate ${compact ? "text-[13.5px]" : "text-[14.5px]"} ${h.doneToday ? "text-ink-2" : ""}`}>
          {h.emoji ? `${h.emoji} ` : ""}
          {h.name}
        </div>
        {!compact && (
          <div className="text-[12px] text-ink-3">
            {isDaily(h.targetPerWeek) ? "Every day" : `${h.thisWeek}/${h.targetPerWeek} this week`}
          </div>
        )}
      </Link>
      {h.streak > 0 && (
        <span className="num inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-warn" title={`Streak: ${h.streak} ${isDaily(h.targetPerWeek) ? "days" : "weeks"}`}>
          <Flame size={12} />
          {h.streak}
          {!isDaily(h.targetPerWeek) && <span className="font-normal text-ink-3">w</span>}
        </span>
      )}
    </li>
  );
}

function ProgressRing({ done, total, size = 22 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={pct >= 1 ? "var(--good)" : "var(--accent)"}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray .4s ease" }}
      />
    </svg>
  );
}

const DOCK_KEY = "lw:habit-dock";

/** Floating checklist on every other page. Minimized state is remembered on this device. */
export function HabitDock({ habits }: { habits: HabitSummary[] }) {
  const path = usePathname();
  const { list, toggle } = useHabitList(habits);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Remembered choice; otherwise open on desktop, minimized on phones (where it would cover the page).
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DOCK_KEY);
    } catch {
      /* private mode */
    }
    setOpen(saved ? saved === "open" : window.innerWidth >= 768);
    setReady(true);
  }, []);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(DOCK_KEY, v ? "open" : "min");
    } catch {
      /* private mode */
    }
  };
  if (!ready || !list.length || path === "/" || path.startsWith("/habits") || path.startsWith("/notes")) return null;
  const done = list.filter((h) => h.doneToday).length;

  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-40 md:bottom-6 md:right-6 print:hidden">
      {open ? (
        <div className="card animate-in w-[min(300px,calc(100vw-24px))] !px-3.5 !py-2.5 shadow-[var(--shadow-lift)]" style={{ background: "var(--card-bg-strong)" }} role="dialog" aria-label="Today's habits">
          <div className="mb-1 flex items-center gap-2">
            <ProgressRing done={done} total={list.length} size={18} />
            <Link href="/habits" className="label-mono hover:text-ink">
              Habits · {done}/{list.length}
            </Link>
            <button className="ml-auto rounded-full p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Minimize habits" onClick={() => set(false)}>
              <ChevronDown size={15} />
            </button>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto">
            {list.map((h) => (
              <HabitRow key={h.id} h={h} compact onToggle={() => toggle(h.id)} />
            ))}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => set(true)}
          className="card animate-in inline-flex items-center gap-2 !rounded-full !px-3 !py-2 text-[13px] font-medium shadow-[var(--shadow-lift)] transition-transform hover:scale-[1.03]"
          style={{ background: "var(--card-bg-strong)" }}
          aria-label={`Show habits: ${done} of ${list.length} done`}
        >
          <ProgressRing done={done} total={list.length} size={20} />
          <span className="num">
            {done}/{list.length}
          </span>
          <span className="hidden text-ink-2 sm:inline">habits</span>
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- heatmap */

/** GitHub-style grid; click a past day to tick or untick it. */
export function HabitHeatmap({ habitId, color, cols, size = 13, weekStart = 0 }: { habitId: string; color: string; cols: Cell[][]; size?: number; weekStart?: number }) {
  const report = useReport();
  const [grid, setGrid] = useState(cols);
  const [, start] = useTransition();
  useEffect(() => setGrid(cols), [cols]);
  const c = projectColor(color).hex;
  const toggle = (day: string, next: boolean) => {
    const before = grid;
    setGrid((g) => g.map((col) => col.map((cell) => (cell.day === day ? { ...cell, done: next } : cell))));
    start(async () => {
      if (!report(await setHabitDone(habitId, day, next))) setGrid(before);
    });
  };
  const months: { i: number; label: string }[] = [];
  grid.forEach((col, i) => {
    const first = col[0].day;
    const prev = grid[i - 1]?.[0].day;
    if (!prev || prev.slice(5, 7) !== first.slice(5, 7)) months.push({ i, label: new Date(`${first}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
  });
  const dayNames = weekStart === 1 ? ["M", "", "W", "", "F", "", ""] : ["", "M", "", "W", "", "F", ""];
  const gap = 3;
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block">
        <div className="relative ml-5 h-4 text-[10px] text-ink-3" style={{ width: grid.length * (size + gap) }}>
          {months.map((m) => (
            <span key={m.i} className="absolute" style={{ left: m.i * (size + gap) }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="flex">
          <div className="mr-1.5 flex w-3.5 flex-col text-[9.5px] text-ink-3" style={{ gap }}>
            {dayNames.map((d, i) => (
              <span key={i} style={{ height: size, lineHeight: `${size}px` }}>
                {d}
              </span>
            ))}
          </div>
          <div className="flex" style={{ gap }}>
            {grid.map((col, i) => (
              <div key={i} className="flex flex-col" style={{ gap }}>
                {col.map((cell) => {
                  const disabled = cell.future;
                  return (
                    <button
                      key={cell.day}
                      disabled={disabled}
                      onClick={() => toggle(cell.day, !cell.done)}
                      title={`${formatDay(cell.day, { year: true })}${cell.done ? " · done" : ""}`}
                      aria-label={`${formatDay(cell.day, { year: true })}: ${cell.done ? "done" : "not done"}`}
                      className="rounded-[3px] transition-transform hover:scale-125 disabled:hover:scale-100"
                      style={{
                        width: size,
                        height: size,
                        background: cell.done ? c : cell.future ? "transparent" : cell.beforeStart ? "color-mix(in srgb, var(--surface-3) 45%, transparent)" : "var(--surface-3)",
                        boxShadow: cell.future ? "inset 0 0 0 1px var(--hairline)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- editor */

const EMOJIS = ["💧", "📖", "🏃", "🧘", "🙏", "💪", "🥗", "😴", "📵", "✍️", "🎸", "🇺🇸", "🧠", "🚶", "🦷", "💊"];

export type HabitEditable = { id: string; name: string; emoji: string | null; color: string; targetPerWeek: number; archived: boolean };

export function HabitButton({ habit, variant = "primary" }: { habit?: HabitEditable; variant?: "primary" | "icon" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {habit ? (
        <button className={variant === "icon" ? "icon-btn !h-8 !w-8" : "btn btn-secondary"} onClick={() => setOpen(true)} aria-label={`Edit ${habit.name}`}>
          <Pencil size={14} />
          {variant !== "icon" && " Edit"}
        </button>
      ) : (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New habit
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={habit ? "Edit habit" : "New habit"}>
        {open && <HabitForm habit={habit} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function HabitForm({ habit, onDone }: { habit?: HabitEditable; onDone: () => void }) {
  const report = useReport();
  const [pending, start] = useTransition();
  const [name, setName] = useState(habit?.name ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "✨");
  const [color, setColor] = useState(habit?.color ?? "green");
  const [target, setTarget] = useState(habit?.targetPerWeek ?? 7);
  const [confirm, setConfirm] = useState(false);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { name, emoji, color, targetPerWeek: target };
    start(async () => {
      if (report(habit ? await updateHabit(habit.id, input) : await createHabit(input))) onDone();
    });
  };
  return (
    <form onSubmit={save} className="space-y-3.5">
      <div className="flex gap-2">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="input !w-14 text-center !text-[20px]" aria-label="Emoji" maxLength={8} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Drink 2L of water, Read 20 min…" className="input !text-[17px] font-medium" required autoFocus={!habit} maxLength={120} />
      </div>
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map((x) => (
          <button key={x} type="button" onClick={() => setEmoji(x)} className={`rounded-lg px-1.5 py-0.5 text-[18px] ${emoji === x ? "bg-surface-3" : "hover:bg-surface-2"}`}>
            {x}
          </button>
        ))}
      </div>
      <Field label="Goal" hint={target === 7 ? "Streaks count days in a row." : "Streaks count weeks in a row that reach the goal."}>
        <div className="segmented" role="radiogroup">
          {[7, 5, 3, 1].map((t) => (
            <label key={t}>
              <input type="radio" name="target" checked={target === t} onChange={() => setTarget(t)} />
              <span className="!text-[13px]">{goalLabel(t)}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] font-normal text-ink-2">
          Or
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))} className="input !w-auto !py-1 !text-[13px]">
            {[1, 2, 3, 4, 5, 6, 7].map((t) => (
              <option key={t} value={t}>
                {goalLabel(t)}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROJECT_COLORS).map(([k, c]) => (
            <button
              key={k}
              type="button"
              aria-label={c.label}
              aria-pressed={color === k}
              onClick={() => setColor(k)}
              className="h-7 w-7 rounded-full transition-transform hover:scale-110"
              style={{ background: c.hex, boxShadow: color === k ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.hex}` : undefined }}
            />
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {habit && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              start(async () => {
                if (report(await setHabitArchived(habit.id, !habit.archived))) onDone();
              })
            }
          >
            {habit.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} {habit.archived ? "Restore" : "Archive"}
          </button>
        )}
        {habit &&
          (confirm ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                start(async () => {
                  if (report(await deleteHabit(habit.id))) {
                    onDone();
                    window.location.assign("/habits");
                  }
                })
              }
            >
              <Trash2 size={14} /> Delete with history
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)} aria-label="Delete habit">
              <Trash2 size={14} />
            </button>
          ))}
        <button className="btn btn-primary ml-auto" disabled={pending}>
          {pending ? "Saving…" : habit ? "Save" : "Add habit"}
        </button>
      </div>
    </form>
  );
}

export function RestoreHabit({ id }: { id: string }) {
  const report = useReport();
  const [, start] = useTransition();
  return (
    <button className="btn btn-ghost" onClick={() => start(async () => void report(await setHabitArchived(id, false)))}>
      <ArchiveRestore size={14} /> Restore
    </button>
  );
}


/** Today: the day's habits as one compact row of tappable pills. */
/** How long an icon has to be held to check a habit off (or undo it). */
const HOLD_MS = 650;

/**
 * One habit as a story-style circle: hold it until the ring closes to check it off for today;
 * hold a done one until the ring empties to undo. A tap does nothing, so the strip can't be ticked by accident.
 */
function HabitStory({ h, onComplete }: { h: HabitSummary; onComplete: () => void }) {
  const c = projectColor(h.color).hex;
  const [p, setP] = useState(0); // 0–1 hold progress
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);
  const fired = useRef(false);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const begin = () => {
    stop();
    fired.current = false;
    t0.current = performance.now() - p * HOLD_MS;
    const step = (now: number) => {
      const v = Math.min(1, (now - t0.current) / HOLD_MS);
      setP(v);
      if (v >= 1) {
        fired.current = true;
        raf.current = null;
        navigator.vibrate?.(12);
        onComplete();
        setTimeout(() => setP(0), 180);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  /** Let go early: the ring runs back quickly. */
  const release = () => {
    if (fired.current || !raf.current) return;
    stop();
    const from = performance.now();
    const p0 = p;
    const back = (now: number) => {
      const v = Math.max(0, p0 - (now - from) / 220);
      setP(v);
      if (v > 0) raf.current = requestAnimationFrame(back);
      else raf.current = null;
    };
    raf.current = requestAnimationFrame(back);
  };
  useEffect(() => stop, []);

  const size = 60;
  const r = size / 2 - 2.5;
  const C = 2 * Math.PI * r;
  // Filled share of the ring: grows while holding an open habit, drains while holding a done one.
  const fill = h.doneToday ? 1 - p : p;
  const label = `${h.name}${h.doneToday ? " — done today" : ""}. Hold to ${h.doneToday ? "undo" : "check off"}.`;

  return (
    <li className="shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-pressed={h.doneToday}
        title={h.name}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          begin();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            begin();
          }
        }}
        onKeyUp={(e) => (e.key === " " || e.key === "Enter") && release()}
        onContextMenu={(e) => e.preventDefault()}
        className="relative block select-none rounded-full outline-none [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        style={{ width: size, height: size, touchAction: "manipulation", transform: `scale(${1 - Math.min(p, 1) * 0.06})`, transition: "transform 120ms" }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth="2" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={c}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fill)}
            opacity={fill > 0 ? 1 : 0}
          />
        </svg>
        <span
          className="absolute inset-[6px] flex items-center justify-center rounded-full text-[24px] leading-none transition-colors"
          style={{ background: h.doneToday ? `color-mix(in srgb, ${c} 16%, var(--surface))` : "var(--surface-2)" }}
          aria-hidden
        >
          <span className={h.doneToday ? "" : "opacity-90"}>{h.emoji || h.name.slice(0, 1).toUpperCase()}</span>
        </span>
        {h.doneToday && (
          <span className="absolute -right-0.5 bottom-0 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[var(--surface)]" style={{ background: c }} aria-hidden>
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {!h.doneToday && h.streak > 0 && (
          <span className="num absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-px rounded-full bg-surface px-1.5 py-px text-[10px] font-medium text-warn shadow-[0_0_0_1px_var(--hairline)]" aria-hidden>
            <Flame size={9} />
            {h.streak}
          </span>
        )}
      </button>
    </li>
  );
}

export function HabitStrip({ habits }: { habits: HabitSummary[] }) {
  const { list, toggle } = useHabitList(habits);
  const done = list.filter((h) => h.doneToday).length;
  if (!list.length) {
    return (
      <section className="card animate-in flex flex-wrap items-center gap-3 !py-3">
        <span className="label-mono">Habits</span>
        <span className="flex-1 text-[13.5px] text-ink-2">Track the habits you want to build — they'll show up here every day.</span>
        <Link href="/habits" className="btn btn-secondary">
          <Plus size={14} /> Add a habit
        </Link>
      </section>
    );
  }
  return (
    <section className="card animate-in flex flex-col items-stretch gap-x-5 gap-y-3 !py-3.5 sm:flex-row sm:items-center">
      <div className="flex items-center justify-between gap-3 sm:block sm:shrink-0">
        <Link href="/habits" className="inline-flex items-center gap-2 pr-1 hover:text-ink" aria-label={`Habits: ${done} of ${list.length} done`}>
          <ProgressRing done={done} total={list.length} />
          <span className="label-mono">Habits</span>
          <span className="num text-[12.5px] text-ink-2">
            {done}/{list.length}
          </span>
        </Link>
        <p className="text-[11.5px] text-ink-3 sm:mt-1">Hold an icon to check it off</p>
      </div>
      <ul className="-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-1.5 pt-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {list.map((h) => (
          <HabitStory key={h.id} h={h} onComplete={() => toggle(h.id)} />
        ))}
      </ul>
    </section>
  );
}
