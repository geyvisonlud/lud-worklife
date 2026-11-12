"use client";

import Link from "next/link";
import { Video } from "lucide-react";
import { projectColor } from "@/lib/colors";
import { formatClockRange, minutesInTz } from "@/lib/dates";
import type { EventDTO, TaskDTO } from "@/lib/data";
import { TaskCheck } from "./TaskBits";
import { useWork } from "./TaskSheet";

/** Today's timeline: events and time-blocked tasks in order, with a "now" marker. */
export function Agenda({ events, tasks, calendars }: { events: EventDTO[]; tasks: TaskDTO[]; calendars: Record<string, string> }) {
  const { tz, projects, openTask } = useWork();
  const nowMin = minutesInTz(new Date(), tz);
  const allDay = events.filter((e) => e.allDay);
  type Row = { key: string; start: number; end: number; node: React.ReactNode };
  const rows: Row[] = [
    ...events
      .filter((e) => !e.allDay)
      .map((e) => {
        const s = minutesInTz(new Date(e.start), tz);
        const en = Math.max(s + 1, minutesInTz(new Date(e.end), tz) || 1440);
        return {
          key: e.id,
          start: s,
          end: en,
          node: (
            <div className={`flex min-w-0 flex-1 items-center gap-3 ${e.declined ? "opacity-55" : ""}`}>
              <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: e.color }} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[14.5px] font-medium ${e.declined ? "line-through" : ""}`}>{e.title}</div>
                <div className="truncate text-[12px] text-ink-2">
                  <span className="num">{formatClockRange(s, en)}</span> · {calendars[e.calendarId] ?? ""}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              {e.meetLink && nowMin < en && (
                <a href={e.meetLink} target="_blank" rel="noreferrer" className="icon-btn !h-8 !w-8 shrink-0" aria-label={`Join ${e.title}`}>
                  <Video size={14} />
                </a>
              )}
            </div>
          ),
        };
      }),
    ...tasks.map((t) => {
      const s = minutesInTz(new Date(t.scheduledStart!), tz);
      const c = projectColor(projects.find((p) => p.id === t.projectId)?.color).hex;
      return {
        key: t.id,
        start: s,
        end: s + t.durationMin,
        node: (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: `repeating-linear-gradient(to bottom, ${c} 0 4px, transparent 4px 7px)` }} />
            <TaskCheck task={t} size={17} />
            <button onClick={() => openTask(t)} className="min-w-0 flex-1 text-left">
              <div className={`truncate text-[14.5px] ${t.status === "done" ? "text-ink-3 line-through" : ""}`}>{t.title}</div>
              <div className="num truncate text-[12px] text-ink-2">{formatClockRange(s, s + t.durationMin)} · Focus block</div>
            </button>
          </div>
        ),
      };
    }),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const nowIndex = rows.findIndex((r) => r.end > nowMin);
  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[12px]">
              <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
              {e.title}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-ink-2">
          Nothing on the calendar today.{" "}
          <Link href="/calendar" className="text-accent">
            Block time for a task →
          </Link>
        </p>
      ) : (
        <ul>
          {rows.map((r, i) => (
            <li key={r.key} className="relative">
              {i === nowIndex && r.start > nowMin && (
                <div className="my-1 flex items-center gap-2" aria-label="Now">
                  <span className="h-2 w-2 rounded-full bg-bad" />
                  <span className="h-px flex-1 bg-bad" />
                </div>
              )}
              <div className={`list-row flex items-center py-2 ${r.end <= nowMin ? "opacity-55" : ""}`}>{r.node}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
