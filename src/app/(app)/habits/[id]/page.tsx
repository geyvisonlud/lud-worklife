import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Flame } from "lucide-react";
import { HabitButton, HabitHeatmap } from "@/components/Habits";
import { Card, StatStrip } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { prisma } from "@/lib/db";
import { formatDay, monthName } from "@/lib/dates";
import { today } from "@/lib/data";
import { bestStreak, completionRate, currentStreak, goalLabel, heatmap, isDaily, streakLabel, weeklyTotals } from "@/lib/habits";
import { getSettings } from "@/lib/settings";

export default async function HabitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await prisma.habit.findUnique({ where: { id }, include: { checks: { select: { day: true }, orderBy: { day: "asc" } } } });
  if (!h) notFound();
  const day = today();
  const { weekStart } = await getSettings();
  const days = new Set(h.checks.map((c) => c.day));
  const created = h.createdAt.toISOString().slice(0, 10);
  const since = h.checks[0]?.day && h.checks[0].day < created ? h.checks[0].day : created;
  const c = projectColor(h.color).hex;
  const streak = currentStreak(days, day, h.targetPerWeek, weekStart);
  const best = bestStreak(days, h.targetPerWeek, weekStart);
  const weeks = weeklyTotals(days, day, 12, weekStart);
  const maxWeek = Math.max(7, ...weeks.map((w) => w.count));
  const rate30 = completionRate(days, day, { target: h.targetPerWeek, window: 30, since });
  const rate90 = completionRate(days, day, { target: h.targetPerWeek, window: 90, since });

  return (
    <div className="space-y-5">
      <Link href="/habits" className="animate-in inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <ChevronLeft size={14} /> Habits
      </Link>
      <section
        className="card animate-in !p-0"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${c} 18%, var(--card-bg)), color-mix(in srgb, ${c} 4%, var(--card-bg)) 70%)` }}
      >
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5 pt-6 md:px-7 md:pt-8">
          <div className="min-w-0 flex-1">
            <div className="mb-3 text-[40px] leading-none">{h.emoji}</div>
            <h1 className="title-xl">{h.name}</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">
              {goalLabel(h.targetPerWeek)} · since {formatDay(since, { year: true })}
              {h.archived ? " · archived" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="num inline-flex items-center gap-1.5 rounded-full bg-[var(--card-bg-strong)] px-3 py-1.5 text-[15px] font-semibold text-warn">
              <Flame size={16} /> {streakLabel(streak, h.targetPerWeek)}
            </span>
            <HabitButton habit={h} />
          </div>
        </div>
      </section>

      <StatStrip
        items={[
          { label: "Current streak", value: streakLabel(streak, h.targetPerWeek), tone: streak ? "good" : undefined, hint: isDaily(h.targetPerWeek) ? "Days in a row" : "Weeks that hit the goal" },
          { label: "Best streak", value: streakLabel(best, h.targetPerWeek), hint: best && best === streak ? "You're on your best run" : "Your record" },
          { label: "Last 30 days", value: `${Math.round(rate30 * 100)}%`, hint: `90 days: ${Math.round(rate90 * 100)}%` },
          { label: "Total", value: `${days.size} ${days.size === 1 ? "day" : "days"}`, hint: "Done since you started" },
        ]}
      />

      <Card title="Last 12 months" action={<span className="text-[12px] text-ink-3">Click a day to tick or untick it</span>}>
        <HabitHeatmap habitId={h.id} color={h.color} cols={heatmap(days, day, 53, { weekStart, since })} size={13} weekStart={weekStart} />
      </Card>

      <Card title="Week by week">
        <div className="flex h-40 items-end gap-2">
          {weeks.map((w) => {
            const met = w.count >= h.targetPerWeek;
            const [, m, d] = w.week.split("-").map(Number);
            return (
              <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`Week of ${formatDay(w.week)}: ${w.count}`}>
                <span className="num text-[11px] text-ink-2">{w.count || ""}</span>
                <div className="w-full rounded-t-[5px]" style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: 2, background: met ? c : `color-mix(in srgb, ${c} 35%, var(--surface-3))` }} />
                <span className="num truncate text-[10px] text-ink-3">
                  {monthName(m)} {d}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-3">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: c }} /> goal reached ({goalLabel(h.targetPerWeek).toLowerCase()})
        </div>
      </Card>
    </div>
  );
}
