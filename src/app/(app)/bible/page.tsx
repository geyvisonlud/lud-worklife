import Link from "next/link";
import { BibleGuide, StartPlan } from "@/components/Bible";
import { Card, EmptyState, PageHeader, StatStrip } from "@/components/ui";
import { BOOKS } from "@/lib/bible-books";
import { PLAN_DAYS, dateOfDay, passageLabel, readingFor } from "@/lib/bible-plan";
import { formatDay } from "@/lib/dates";
import { bibleState } from "@/lib/data";

export default async function BiblePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const state = await bibleState();

  if (!state.started) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Reading guide · 365 days" title="Bible in a year" />
        <EmptyState title="Read the whole Bible in a year">
          A daily guide for reading your own Bible: a passage from the Old Testament and one from the New Testament, with the Psalms woven in — about three
          chapters, 15 minutes. Tick each day as you go and see the whole year at a glance.
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
  const all = Array.from({ length: PLAN_DAYS }, (_, i) => {
    const x = readingFor(i + 1);
    return { day: i + 1, date: dateOfDay(start, i + 1), ot: x.ot, nt: x.nt };
  });

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Reading guide · started ${formatDay(start, { year: true })}`} title="Bible in a year">
        {day !== current && current > 0 && (
          <Link href="/bible" className="btn btn-secondary">
            Back to today
          </Link>
        )}
        <div className="flex gap-1">
          {day > 1 && (
            <Link href={`/bible?day=${day - 1}`} className="icon-btn" aria-label="Previous day" scroll={false}>
              ‹
            </Link>
          )}
          {day < PLAN_DAYS && (
            <Link href={`/bible?day=${day + 1}`} className="icon-btn" aria-label="Next day" scroll={false}>
              ›
            </Link>
          )}
        </div>
      </PageHeader>

      <StatStrip
        items={[
          { label: "Today", value: current ? `Day ${current}` : "Not started", hint: `of ${PLAN_DAYS}` },
          { label: "Read", value: `${progress.read} ${progress.read === 1 ? "day" : "days"}`, tone: progress.read ? "good" : undefined, hint: `${Math.round(progress.pct * 100)}% · ${progress.chapters} chapters` },
          { label: "To catch up", value: progress.behind ? `${progress.behind} ${progress.behind === 1 ? "day" : "days"}` : "None", tone: progress.behind ? "warn" : "good", hint: catchUp && catchUp < current ? `Next: day ${catchUp}` : "You're up to date" },
          { label: "Finish", value: formatDay(dateOfDay(start, PLAN_DAYS), { year: true }), hint: "Day 365" },
        ]}
      />

      <BibleGuide
        selected={{ day, date: dateOfDay(start, day), ot: r.ot, nt: r.nt }}
        current={current}
        done={[...done]}
        days={all}
        books={BOOKS}
      />

      <Card title="Plan">
        <p className="mb-3 text-[13px] text-ink-2">Change the start date to move the whole plan. Restarting also clears the days you marked as read.</p>
        <StartPlan restart current={start} />
      </Card>
    </div>
  );
}
