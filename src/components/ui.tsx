import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PROJECT_COLORS, projectColor } from "@/lib/colors";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 animate-in">
      <div className="min-w-0">
        {eyebrow && <div className="label-mono mb-2">{eyebrow}</div>}
        <h1 className="title-xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Card with an optional mono-caps header strip ("AGENDA ›"); `href` makes the label a link. */
export function Card({ title, href, action, className = "", children }: { title?: string; href?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`card animate-in ${className}`}>
      {(title || action) && (
        <div className="card-head flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {title &&
            (href ? (
              <h2 className="label-mono">
                <Link href={href} className="inline-flex items-center gap-1 hover:text-ink">
                  {title}
                  <ChevronRight size={12} strokeWidth={2} aria-hidden />
                </Link>
              </h2>
            ) : (
              <h2 className="label-mono">{title}</h2>
            ))}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** One card with several figures separated by hairlines. */
export function StatStrip({ items, className = "" }: { items: { label: string; value: string; hint?: React.ReactNode; tone?: "good" | "bad" | "warn" }[]; className?: string }) {
  const cols = items.length === 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <section className={`card animate-in grid grid-cols-2 !p-0 ${cols} ${className}`}>
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`min-w-0 px-5 py-4 ${i % 2 === 1 ? "border-l border-hairline" : ""} ${i >= 2 ? "border-t border-hairline lg:border-t-0" : ""} ${i >= 1 ? "lg:border-l lg:border-hairline" : ""}`}
        >
          <div className="label-mono !text-[10px]">{it.label}</div>
          <div className={`num mt-2 truncate text-[20px] font-semibold sm:text-[22px] ${it.tone === "bad" ? "text-bad" : it.tone === "good" ? "text-good" : it.tone === "warn" ? "text-warn" : ""}`}>
            {it.value}
          </div>
          {it.hint && <div className="mt-0.5 truncate text-[12px] text-ink-2">{it.hint}</div>}
        </div>
      ))}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card animate-in px-6 py-16 text-center">
      <div className="text-[22px] font-medium tracking-[-0.02em]">{title}</div>
      <div className="mx-auto mt-2 max-w-md text-[15px] text-ink-2">{children}</div>
    </div>
  );
}

/** Project emoji on a tinted square in the project's color. */
export function ProjectGlyph({ emoji, color, size = 32 }: { emoji?: string | null; color: string; size?: number }) {
  const c = projectColor(color);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        background: `color-mix(in srgb, ${c.hex} 13%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.hex} 20%, transparent)`,
      }}
      aria-hidden
    >
      {emoji || <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.hex }} />}
    </span>
  );
}

/** Notion's "N" mark, monochrome so it follows the theme. */
export function NotionMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-label="Notion" role="img">
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 16.8V7.6l7.6 9.2V7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, pct * 100)}%`, background: color }} />
    </div>
  );
}

/** "Assigned · Owner" / "Mentioned" from Project.notionReason. */
export const notionReasonLabel = (r: string | null) => (r?.startsWith("assigned:") ? `Assigned · ${r.slice(9)}` : r === "mentioned" ? "Mentioned" : "From Notion");

/** A board column's dot color: a PROJECT_COLORS key, or "gray" (the muted ink token). */
export const columnColor = (key: string) => (key in PROJECT_COLORS ? PROJECT_COLORS[key].hex : "var(--ink-3)");
