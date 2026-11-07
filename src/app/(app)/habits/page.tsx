import Link from "next/link";
import { Flame } from "lucide-react";
import { HabitButton, HabitHeatmap, RestoreHabit } from "@/components/Habits";
import { EmptyState, PageHeader, ProgressBar, StatStrip } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { prisma } from "@/lib/db";
import { today } from "@/lib/data";
import { bestStreak, completionRate, currentStreak, goalLabel, heatmap, isDaily, streakLabel, weekCount } from "@/lib/habits";
import { getSettings } from "@/lib/settings";

export default async function HabitsPage() {
  const day = today();
  const { weekStart } = await getSettings();
  const habits = await prisma.habit.findMany({ include: { checks: { select: { day: true } } }, orderBy: [{ archived: "asc" }, { position: "asc" }, { createdAt: "asc" }] });
  const rows = habits.map((h) => {
    const days = new Set(h.checks.map((c) => c.day));
    const since = h.createdAt.toISOString().slice(0, 10) < [...days].sort()[0] ? h.createdAt.toISOString().slice(0, 10) : [...days].sort()[0] ?? h.createdAt.toISOString().slice(0, 10);
    return {
      h,
      days,
      since,
      streak: currentStreak(days, day, h.targetPerWeek, weekStart),
      best: bestStreak(days, h.targetPerWeek, weekStart),
      rate: completionRate(days, day, { target: h.targetPerWeek, window: 30, since }),
      week: weekCount(days, day, weekStart),
    };
  });
  const active = rows.filter((r) => !r.h.archived);
  const archived = rows.filter((r) => r.h.archived);
  const doneToday = active.filter((r) => r.days.has(day)).length;
  const avg = active.length ? active.reduce((s, r) => s + r.rate, 0) / active.length : 0;
  const longest = active.reduce<(typeof active)[number] | null>((m, r) => (!m || r.streak > m.streak ? r : m), null);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Tick them on Today or in the corner of any page" title="Habits">
        <HabitButton />
      </PageHeader>

      {active.length > 0 && (
        <StatStrip
          items={[
            { label: "Today", value: `${doneToday} of ${active.length}`, tone: doneToday === active.length ? "good" : undefined, hint: doneToday === active.length ? "All done" : "Still to do" },
            { label: "Last 30 days", value: `${Math.round(avg * 100)}%`, hint: "Average of your goals" },
            { label: "Longest streak now", value: longest && longest.streak ? streakLabel(longest.streak, longest.h.targetPerWeek) : "—", hint: longest?.streak ? longest.h.name : "Start one today" },
            { label: "Habits", value: String(active.length), hint: archived.length ? `${archived.length} archived` : "Active" },
          ]}
        />
      )}

      {active.length ? (
        <ul className="grid gap-5 lg:grid-cols-2">
          {active.map(({ h, days, since, streak, best, rate, week }) => {
            const c = projectColor(h.color).hex;
            return (
              <li key={h.id} className="card animate-in">
                <div className="mb-3 flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[20px]" style={{ background: `color-mix(in srgb, ${c} 14%, var(--surface))` }}>
                    {h.emoji ?? "•"}
                  </span>
                  <Link href={`/habits/${h.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-medium hover:underline">{h.name}</div>
                    <div className="text-[12.5px] text-ink-2">
                      {goalLabel(h.targetPerWeek)}
                      {!isDaily(h.targetPerWeek) && ` · ${week}/${h.targetPerWeek} this week`}
                    </div>
                  </Link>
                  <HabitButton habit={h} variant="icon" />
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-surface-2 py-2">
                    <div className="num inline-flex items-center gap-1 text-[18px] font-semibold text-warn">
                      <Flame size={15} /> {streak}
                    </div>
                    <div className="text-[11px] text-ink-2">{isDaily(h.targetPerWeek) ? "day streak" : "week streak"}</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 py-2">
                    <div className="num text-[18px] font-semibold">{best}</div>
                    <div className="text-[11px] text-ink-2">best</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 py-2">
                    <div className="num text-[18px] font-semibold">{Math.round(rate * 100)}%</div>
                    <div className="text-[11px] text-ink-2">last 30 days</div>
                  </div>
                </div>
                <HabitHeatmap habitId={h.id} color={h.color} cols={heatmap(days, day, 17, { weekStart, since })} size={12} weekStart={weekStart} />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <ProgressBar pct={rate} color={c} />
                  </div>
                  <Link href={`/habits/${h.id}`} className="text-[12.5px] text-accent">
                    See evolution →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No habits yet">
          Add the habits you want to build — drinking water, reading, prayer, the gym. Tick them each day on Today or in the floating list, and
          follow your streaks here.
        </EmptyState>
      )}

      {archived.length > 0 && (
        <section className="card animate-in">
          <div className="card-head">
            <h2 className="label-mono">Archived</h2>
          </div>
          <ul>
            {archived.map(({ h, days }) => (
              <li key={h.id} className="list-row flex items-center gap-3 py-2.5">
                <span className="text-[18px]">{h.emoji ?? "•"}</span>
                <Link href={`/habits/${h.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] text-ink-2">{h.name}</div>
                  <div className="text-[12px] text-ink-3">{days.size} days done</div>
                </Link>
                <RestoreHabit id={h.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
