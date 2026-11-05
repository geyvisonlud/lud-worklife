"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckCircle2, Heart, KanbanSquare, LogOut, PlugZap, Sun } from "lucide-react";
import { logout } from "@/app/actions";

const ITEMS = [
  { href: "/", label: "Today", icon: Sun, group: "Plan" },
  { href: "/tasks", label: "Tasks", icon: CheckCircle2, group: "Plan" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "Plan" },
  { href: "/projects", label: "Projects", icon: KanbanSquare, group: "Work" },
  { href: "/saved", label: "Saved", icon: Heart, group: "Work", desktopOnly: true },
  { href: "/connections", label: "Connections", icon: PlugZap, group: "Settings" },
];
const GROUPS = ["Plan", "Work", "Settings"];

export type Badges = Partial<Record<string, number>>;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Sidebar({ badges, authEnabled, sync }: { badges: Badges; authEnabled: boolean; sync: { label: string; ok: boolean }[] }) {
  const path = usePathname();
  return (
    <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-hairline px-3 pb-3 pt-5 md:flex">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
        <span className="text-[16px] font-semibold tracking-[-0.02em]">Lud Worklife</span>
      </Link>
      <nav className="flex flex-col overflow-y-auto">
        {GROUPS.map((g, gi) => (
          <div key={g} className={gi ? "mt-2.5 border-t border-hairline pt-2.5" : ""} role="group" aria-label={g}>
            <div className="flex flex-col gap-px">
              {ITEMS.filter((i) => i.group === g).map(({ href, label, icon: Icon }) => {
                const active = isActive(path, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-[6px] text-[13.5px] transition-colors ${
                      active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                    }`}
                  >
                    <Icon size={15} strokeWidth={1.8} className={active ? "text-ink" : "text-ink-3"} />
                    {label}
                    {badges[href] ? (
                      <span className={`num ml-auto min-w-5 rounded-full px-1.5 text-center text-[10.5px] font-semibold text-white ${href === "/tasks" ? "bg-bad" : "bg-accent"}`}>
                        {badges[href]}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto space-y-0.5 rounded-[10px] border border-hairline bg-[var(--card-bg)] p-1.5">
        {sync.map((s) => (
          <div key={s.label} className="flex items-center gap-2 px-2 py-1 text-[12px] text-ink-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.ok ? "bg-good" : "bg-warn"}`} aria-hidden />
            <span className="truncate">{s.label}</span>
          </div>
        ))}
        {authEnabled && (
          <form action={logout}>
            <button className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <LogOut size={13} /> Sign out
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

/** iPhone-style tab bar: all five sections fit. */
export function TabBar({ badges }: { badges: Badges }) {
  const path = usePathname();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.filter((i) => !("desktopOnly" in i)).map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <Link key={href} href={href} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? "text-accent" : "text-ink-2"}`}>
            <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
            {label}
            {badges[href] ? <span className={`absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full ${href === "/tasks" ? "bg-bad" : "bg-accent"}`} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
