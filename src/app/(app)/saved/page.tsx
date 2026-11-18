import Link from "next/link";
import { SavedList } from "@/components/SavedList";
import { EmptyState, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const filter = kind === "stoic" || kind === "verse" ? kind : null;
  const [rows, counts] = await Promise.all([
    prisma.savedQuote.findMany({ where: filter ? { kind: filter } : {}, orderBy: { createdAt: "desc" } }),
    prisma.savedQuote.groupBy({ by: ["kind"], _count: true }),
  ]);
  const count = (k: string) => counts.find((c) => c.kind === k)?._count ?? 0;
  const total = count("stoic") + count("verse");
  return (
    <div>
      <PageHeader eyebrow={`${total} saved`} title="Saved thoughts & verses" />
      <nav className="animate-in mb-5 flex gap-2" aria-label="Filter">
        <Link href="/saved" className="pill" aria-current={!filter ? "page" : undefined}>
          All · {total}
        </Link>
        <Link href="/saved?kind=stoic" className="pill" aria-current={filter === "stoic" ? "page" : undefined}>
          Stoic · {count("stoic")}
        </Link>
        <Link href="/saved?kind=verse" className="pill" aria-current={filter === "verse" ? "page" : undefined}>
          Verses · {count("verse")}
        </Link>
      </nav>
      {rows.length ? (
        <SavedList key={filter ?? "all"} items={rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, source: r.source, detail: r.detail, theme: r.theme, savedAt: r.createdAt.toISOString() }))} />
      ) : (
        <EmptyState title="Nothing saved yet">
          Tap the heart on Today&apos;s stoic thought or verse to keep the ones that matter to you here.{" "}
          <Link href="/" className="text-accent">
            Go to Today →
          </Link>
        </EmptyState>
      )}
    </div>
  );
}
