import Link from "next/link";
import { BibleReader, PlanMap, StartPlan } from "@/components/Bible";
import { Card, EmptyState, PageHeader, StatStrip } from "@/components/ui";
import { BOOKS } from "@/lib/bible-books";
import { PLAN_DAYS, dateOfDay, nivUrl, passageLabel, readingFor } from "@/lib/bible-plan";
import { formatDay } from "@/lib/dates";
import { bibleState } from "@/lib/data";

// Study notes for a day's chapters are written on first view (a few chapters in parallel).
export const maxDuration = 60;

export default async function BiblePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const state = await bibleState();

  if (!state.started) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="NIV · 365 days" title="Bible in a year" />
        <EmptyState title="Read the whole Bible in a year">
          Every day: a passage from the Old Testament and one from the New Testament, with the Psalms woven in — about three chapters, 15 minutes. The NIV text
          opens beside study notes for each chapter (background, themes, cross-references and a thought for the day).
          <div className="mt-5 flex justify-center">
            <StartPlan />
          </div>
        </EmptyState>
        <Card title="What you'll read">
          <ul className="grid gap-x-6 gap-y-1 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
            {[1, 50, 100, 150, 200, 250, 300, 365].map((d) => {
              const r = readingFor(d);
              return (
                <li key={d} className="flex gap-3">
                  <span className="num w-14 shrink-0 text-ink-3">Day {d}</span>
                  <span>{[...r.ot, ...r.nt].map(passageLabel).join(" · ")}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    );
  }

  const { start, current, done, progress, catchUp } = state;
  const asked = Number(sp.day);
  const day = Number.isInteger(asked) && asked >= 1 && asked <= PLAN_DAYS ? asked : current || 1;
  const r = readingFor(day);
  const date = dateOfDay(start, day);
  const upcoming = Array.from({ length: 6 }, (_, i) => day + 1 + i).filter((d) => d <= PLAN_DAYS);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`NIV · started ${formatDay(start, { year: true })}`} title="Bible in a year">
        {day !== current && current > 0 && (
          <Link href="/bible" className="btn btn-secondary">
            Back to today
          </Link>
        )}
        <div className="flex gap-1">
          {day > 1 && (
            <Link href={`/bible?day=${day - 1}`} className="icon-btn" aria-label="Previous day">
              ‹
            </Link>
          )}
          {day < PLAN_DAYS && (
            <Link href={`/bible?day=${day + 1}`} className="icon-btn" aria-label="Next day">
              ›
            </Link>
          )}
        </div>
      </PageHeader>

      <StatStrip
        items={[
          { label: "Today", value: current ? `Day ${current}` : "Not started", hint: `of ${PLAN_DAYS}` },
          { label: "Read", value: `${progress.read} days`, tone: progress.read ? "good" : undefined, hint: `${Math.round(progress.pct * 100)}% · ${progress.chapters} chapters` },
          { label: "To catch up", value: progress.behind ? `${progress.behind} days` : "None", tone: progress.behind ? "warn" : "good", hint: catchUp && catchUp < current ? `Next: day ${catchUp}` : "You're up to date" },
          { label: "Finish", value: formatDay(dateOfDay(start, PLAN_DAYS), { year: true }), hint: "Day 365" },
        ]}
      />

      <BibleReader day={day} date={date} ot={r.ot} nt={r.nt} url={nivUrl([...r.ot, ...r.nt])} read={done.has(day)} books={BOOKS} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="The year">
          <PlanMap start={start} current={current} done={[...done]} selected={day} />
          <div className="mt-3 flex flex-wrap gap-4 text-[11.5px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-good" /> Read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" /> Today
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--warn-soft)", boxShadow: "inset 0 0 0 1px var(--warn)" }} /> To catch up
            </span>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Coming up">
            <ul>
              {upcoming.map((d) => {
                const u = readingFor(d);
                return (
                  <li key={d} className="list-row">
                    <Link href={`/bible?day=${d}`} className="flex gap-3 py-2 text-[13.5px] hover:text-accent">
                      <span className="num w-14 shrink-0 text-ink-3">Day {d}</span>
                      <span className="min-w-0">{[...u.ot, ...u.nt].map(passageLabel).join(" · ")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Plan">
            <p className="mb-3 text-[13px] text-ink-2">Change the start date to move the whole plan. Restarting also clears the days you marked as read.</p>
            <StartPlan restart current={start} />
          </Card>
        </div>
      </div>
    </div>
  );
}
