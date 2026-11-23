"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, BookOpen, ChevronRight, FileText, Heart, Inbox, KanbanSquare, List as ListIcon, LogOut, MoreHorizontal, NotebookPen, BookmarkCheck, PanelLeftClose, PanelLeftOpen, PlugZap, Repeat, Search, Sun } from "lucide-react";
import { logout } from "@/app/actions";
import { projectColor } from "@/lib/colors";
import { ProjectButton } from "./ProjectSheet";
import { OPEN_PALETTE } from "./CommandPalette";

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

export type Badges = Partial<Record<string, number>>;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export type SideProject = { id: string; name: string; emoji: string | null; color: string; open: number; notion?: boolean };
export type SideCounts = { overdue: number; inbox: number; open: number };

const SIDEBAR_KEY = "lw:sidebar";
const EXPANDED_KEY = "lw:sidebar-projects";

/**
 * Desktop sidebar (workspace style): brand + collapse, "Search or jump to…" (⌘K / "/" — the command palette), the day's
 * places with counts, WORKSPACE pages, PROJECTS (each expands to Board / List / Notion page), then Connections and sync
 * status. Collapses to an icon rail (remembered); its width is `--lp` on <html>, which the page pads by.
 */
export function Sidebar({ counts, authEnabled, sync, projects }: { counts: SideCounts; authEnabled: boolean; sync: { label: string; ok: boolean }[]; projects: SideProject[] }) {
  const path = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "rail");
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--lp", collapsed ? "4.25rem" : "15rem");
  }, [collapsed]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "open" : "rail");
      } catch {
        /* private mode */
      }
      return !c;
    });
  };
  const listView = path.startsWith("/tasks") && params.get("view") === "list";
  const top = [
    { href: "/", label: "Today", icon: Sun, active: path === "/" },
    { href: "/tasks?view=list", label: "Inbox", icon: Inbox, active: listView && !params.get("project"), count: counts.inbox, pill: true },
    { href: "/tasks", label: "My tasks", icon: CheckCircle2, active: path.startsWith("/tasks") && !listView, count: counts.overdue || counts.open, bad: counts.overdue > 0 },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, active: path.startsWith("/calendar") },
  ];
  const workspace = [
    { href: "/projects", label: "Projects", icon: KanbanSquare },
    { href: "/notes", label: "Notes", icon: NotebookPen },
    { href: "/read-later", label: "Read Later", icon: BookmarkCheck },
    { href: "/habits", label: "Habits", icon: Repeat },
    { href: "/bible", label: "Bible", icon: BookOpen },
    { href: "/saved", label: "Saved", icon: Heart },
  ];
  const item = (o: { href: string; label: string; icon: typeof Sun; active: boolean; count?: number; pill?: boolean; bad?: boolean }) => (
    <Link
      key={o.href + o.label}
      href={o.href}
      aria-current={o.active ? "page" : undefined}
      title={collapsed ? o.label : undefined}
      className={`flex items-center gap-2.5 rounded-[8px] py-[6px] text-[13.5px] transition-colors ${collapsed ? "justify-center px-0" : "px-2.5"} ${
        o.active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <span className="relative">
        <o.icon size={16} strokeWidth={1.8} className={o.active ? "text-ink" : "text-ink-3"} />
        {collapsed && o.count ? <span className={`absolute -right-1.5 -top-1 h-2 w-2 rounded-full ${o.bad ? "bg-bad" : "bg-accent"}`} /> : null}
      </span>
      {!collapsed && <span className="truncate">{o.label}</span>}
      {!collapsed && o.count ? (
        o.pill || o.bad ? (
          <span className={`num ml-auto min-w-5 rounded-full px-1.5 text-center text-[10.5px] font-semibold leading-[18px] text-white ${o.bad ? "bg-bad" : "bg-accent"}`}>{o.count}</span>
        ) : (
          <span className="num ml-auto text-[11.5px] text-ink-3">{o.count}</span>
        )
      ) : null}
    </Link>
  );
  const label = (text: string, extra?: React.ReactNode) =>
    collapsed ? (
      <div className="mx-2 my-2 border-t border-hairline" />
    ) : (
      <div className="mb-1 mt-4 flex items-center justify-between pl-2.5 pr-1">
        <span className="label-mono !text-[10.5px]">{text}</span>
        {extra}
      </div>
    );

  return (
    <aside className={`glass fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-hairline pb-3 pt-4 md:flex ${collapsed ? "w-[4.25rem] px-2" : "w-60 px-3"}`}>
      <div className={`mb-3 flex items-center gap-2 ${collapsed ? "flex-col" : "px-1.5"}`}>
        <Link href="/" className="flex min-w-0 items-center gap-2" title="Lud Worklife">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7 shrink-0 rounded-[7px]" />
          {!collapsed && <span className="truncate text-[15.5px] font-semibold tracking-[-0.02em]">Lud Worklife</span>}
        </Link>
        <button onClick={toggle} className={`rounded-[7px] p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink ${collapsed ? "" : "ml-auto"}`} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
        className={`mb-2 flex items-center gap-2 rounded-[9px] border border-hairline bg-surface text-[13px] text-ink-3 transition-colors hover:text-ink ${collapsed ? "justify-center py-2" : "px-2.5 py-[7px]"}`}
        aria-label="Search or jump to…"
        title={collapsed ? "Search (⌘K)" : undefined}
      >
        <Search size={14} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded-[5px] border border-hairline px-1.5 text-[10.5px] font-medium">⌘K</kbd>
          </>
        )}
      </button>

      <nav className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" aria-label="Main">
        <div className="flex flex-col gap-px">{top.map(item)}</div>
        {label("Workspace")}
        <div className="flex flex-col gap-px">{workspace.map((w) => item({ ...w, active: path.startsWith(w.href) }))}</div>
        {label("Projects", <ProjectButton compact />)}
        <SidebarProjects projects={projects} path={path} listProject={listView ? params.get("project") : null} collapsed={collapsed} />
      </nav>

      <div className="mt-2 flex flex-col gap-px border-t border-hairline pt-2">
        {item({ href: "/connections", label: "Connections", icon: PlugZap, active: path.startsWith("/connections") })}
        {!collapsed && (
          <div className="mt-1 space-y-0.5 rounded-[10px] border border-hairline bg-[var(--card-bg)] p-1.5">
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

/** PROJECTS in the sidebar: each expands to Board / List (/ Notion page); open-task counts; + makes a new one. */
function SidebarProjects({ projects, path, listProject, collapsed }: { projects: SideProject[]; path: string; listProject: string | null; collapsed: boolean }) {
  const [all, setAll] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "null");
      if (Array.isArray(s)) setExpanded(s);
    } catch {
      /* private mode */
    }
  }, []);
  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  const shown = all || collapsed ? projects : projects.slice(0, 8);
  return (
    <div className="flex flex-col gap-px" role="group" aria-label="Projects">
      {shown.map((p) => {
        const onBoard = path === `/projects/${p.id}`;
        const onList = listProject === p.id;
        const open = expanded.includes(p.id) || onBoard || onList;
        const c = projectColor(p.color).hex;
        const icon = (
          <span className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] text-[11px] leading-none" style={{ background: `color-mix(in srgb, ${c} 18%, var(--surface))`, color: c }} aria-hidden>
            {p.emoji ?? <span className="h-2 w-2 rounded-full" style={{ background: c }} />}
          </span>
        );
        if (collapsed)
          return (
            <Link key={p.id} href={`/projects/${p.id}`} title={p.name} className={`flex justify-center rounded-[8px] py-[5px] ${onBoard ? "bg-surface-3" : "hover:bg-surface-2"}`}>
              {icon}
            </Link>
          );
        const sub = (href: string, label: string, Icon: typeof Sun, active: boolean) => (
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-[7px] py-[4px] pl-3 pr-2 text-[12.5px] ${active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
          >
            <Icon size={13} className="text-ink-3" /> {label}
          </Link>
        );
        return (
          <div key={p.id}>
            <div className={`group flex items-center rounded-[8px] ${onBoard || onList ? "" : "hover:bg-surface-2"}`}>
              <button onClick={() => toggle(p.id)} className="rounded p-1 pl-1.5 text-ink-3 hover:text-ink" aria-label={open ? `Collapse ${p.name}` : `Expand ${p.name}`} aria-expanded={open}>
                <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
              </button>
              <Link href={`/projects/${p.id}`} className={`flex min-w-0 flex-1 items-center gap-2 py-[5px] pr-2 text-[13px] ${onBoard ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
                {icon}
                <span className="truncate">{p.name}</span>
                {p.open > 0 ? <span className="num ml-auto text-[11px] text-ink-3">{p.open}</span> : <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ background: c }} />}
              </Link>
            </div>
            {open && (
              <div className="mb-1 ml-[22px] flex flex-col gap-px border-l border-hairline pl-1">
                {sub(`/projects/${p.id}`, "Board", KanbanSquare, onBoard)}
                {sub(`/tasks?view=list&project=${p.id}`, "List", ListIcon, onList)}
                {p.notion && sub(`/projects/${p.id}?tab=notion`, "Notion page", FileText, false)}
              </div>
            )}
          </div>
        );
      })}
      {!collapsed && projects.length > 8 && (
        <button className="rounded-[8px] px-2.5 py-[5px] text-left text-[12px] text-ink-3 hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "Show less" : `${projects.length - 8} more`}
        </button>
      )}
      {!collapsed && !projects.length && <p className="px-2.5 py-1 text-[12px] text-ink-3">No projects going.</p>}
    </div>
  );
}
