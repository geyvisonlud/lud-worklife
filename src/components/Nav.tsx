"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, BookOpen, Heart, KanbanSquare, LogOut, MoreHorizontal, NotebookPen, BookmarkCheck, PlugZap, Repeat, Sun } from "lucide-react";
import { logout } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { ProjectButton } from "./ProjectSheet";

const ITEMS = [
  { href: "/", label: "Today", icon: Sun, group: "Plan" },
  { href: "/tasks", label: "Tasks", icon: CheckCircle2, group: "Plan" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "Plan" },
  { href: "/habits", label: "Habits", icon: Repeat, group: "Plan", desktopOnly: true },
  { href: "/bible", label: "Bible", icon: BookOpen, group: "Plan", desktopOnly: true },
  { href: "/projects", label: "Projects", icon: KanbanSquare, group: "Work", phoneMore: true },
  { href: "/notes", label: "Notes", icon: NotebookPen, group: "Work" },
  { href: "/read-later", label: "Read Later", icon: BookmarkCheck, group: "Work", phoneMore: true },
  { href: "/saved", label: "Saved", icon: Heart, group: "Work", desktopOnly: true },
  { href: "/connections", label: "Connections", icon: PlugZap, group: "Settings", phoneMore: true },
];
const GROUPS = ["Plan", "Work", "Settings"];

export type Badges = Partial<Record<string, number>>;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export type SideProject = { id: string; name: string; emoji: string | null; color: string; open: number };

export function Sidebar({ badges, authEnabled, sync, projects }: { badges: Badges; authEnabled: boolean; sync: { label: string; ok: boolean }[]; projects: SideProject[] }) {
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
            {g === "Work" && <SidebarProjects projects={projects} path={path} />}
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

/** iPhone-style tab bar: Today, Tasks, Calendar, Notes — everything else under More. */
export function TabBar({ badges }: { badges: Badges }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const tabs = ITEMS.filter((i) => !("desktopOnly" in i) && !("phoneMore" in i));
  const rest = [...ITEMS.filter((i) => "phoneMore" in i && i.group !== "Settings"), ...ITEMS.filter((i) => "desktopOnly" in i), ...ITEMS.filter((i) => "phoneMore" in i && i.group === "Settings")];
  const moreActive = rest.some((i) => isActive(path, i.href));
  return (
    <>
      {more && <div className="fixed inset-0 z-40 bg-black/25 md:hidden" onClick={() => setMore(false)} aria-hidden />}
      {more && (
        <div className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom))] z-50 bg-[var(--card-bg-strong)] backdrop-blur-xl rounded-[18px] border border-hairline p-2 shadow-[var(--shadow-lift)] md:hidden" role="menu" aria-label="More">
          <div className="grid grid-cols-3 gap-1">
            {rest.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                className={`flex flex-col items-center gap-1 rounded-[12px] px-1 py-3 text-[12px] font-medium ${isActive(path, href) ? "bg-surface-3 text-accent" : "text-ink-2 active:bg-surface-2"}`}
              >
                <Icon size={21} strokeWidth={1.8} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="glass fixed inset-x-0 bottom-0 z-50 flex border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = !more && isActive(path, href);
          return (
            <Link key={href} href={href} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? "text-accent" : "text-ink-2"}`}>
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {badges[href] ? <span className={`absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full ${href === "/tasks" ? "bg-bad" : "bg-accent"}`} /> : null}
            </Link>
          );
        })}
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${more || moreActive ? "text-accent" : "text-ink-2"}`}
        >
          <MoreHorizontal size={22} strokeWidth={more || moreActive ? 2.2 : 1.8} />
          More
        </button>
      </nav>
    </>
  );
}

/** "Projects" in the sidebar: projects that aren't done, with their color and open tasks; + makes a new one. */
function SidebarProjects({ projects, path }: { projects: SideProject[]; path: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? projects : projects.slice(0, 7);
  return (
    <div className="mt-2.5 border-t border-hairline pt-2.5" role="group" aria-label="Projects">
      <div className="flex items-center justify-between pb-1 pl-2.5 pr-1">
        <Link href="/projects" className="text-[12px] font-medium text-ink-3 hover:text-ink">
          Projects
        </Link>
        <ProjectButton compact />
      </div>
      <div className="flex flex-col gap-px">
        {shown.map((p) => {
          const active = path === `/projects/${p.id}`;
          const c = projectColor(p.color).hex;
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 items-center gap-2.5 rounded-[8px] px-2.5 py-[5px] text-[13px] transition-colors ${active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
            >
              <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10.5px] leading-none" style={{ background: p.emoji ? `color-mix(in srgb, ${c} 18%, var(--surface))` : c }} aria-hidden>
                {p.emoji ?? ""}
              </span>
              <span className="truncate">{p.name}</span>
              {p.open > 0 && <span className="num ml-auto text-[11px] text-ink-3">{p.open}</span>}
            </Link>
          );
        })}
        {projects.length > 7 && (
          <button className="rounded-[8px] px-2.5 py-[5px] text-left text-[12px] text-ink-3 hover:text-ink" onClick={() => setAll(!all)}>
            {all ? "Show less" : `${projects.length - 7} more`}
          </button>
        )}
        {!projects.length && <p className="px-2.5 py-1 text-[12px] text-ink-3">No projects going.</p>}
      </div>
    </div>
  );
}
