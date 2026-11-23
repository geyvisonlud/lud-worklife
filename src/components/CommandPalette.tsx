"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, BookmarkCheck, CalendarDays, CheckCircle2, CornerDownLeft, FileText, FolderKanban, Heart, Inbox, KanbanSquare, NotebookPen, Plus, PlugZap, Repeat, Search, Sun } from "lucide-react";
import { createNote } from "@/app/actions";
import { useWork } from "./TaskSheet";

/** Fired on window to open the palette (the sidebar's search box). */
export const OPEN_PALETTE = "lw:open-palette";

type Item = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };
type Found = {
  tasks: { id: string; title: string; done: boolean; dueDate: string | null; project: string | null }[];
  projects: { id: string; name: string; emoji: string | null }[];
  notes: { id: string; title: string }[];
};

const PAGES: [string, string, typeof Sun][] = [
  ["/", "Today", Sun],
  ["/tasks?view=list", "Inbox · task list", Inbox],
  ["/tasks", "My tasks · board", CheckCircle2],
  ["/calendar", "Calendar", CalendarDays],
  ["/projects", "Projects", KanbanSquare],
  ["/notes", "Notes", NotebookPen],
  ["/read-later", "Read Later", BookmarkCheck],
  ["/habits", "Habits", Repeat],
  ["/bible", "Bible", BookOpen],
  ["/saved", "Saved", Heart],
  ["/connections", "Connections", PlugZap],
];

/**
 * "Search or jump to…" (⌘K, Ctrl+K or "/"): pages, actions, and — as you type — tasks, projects and notes
 * (`GET /api/search`). Arrow keys + Enter, Esc closes.
 */
export function CommandPalette() {
  const router = useRouter();
  const { projects, openTask } = useWork();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => (setOpen(true), setQ(""), setFound(null), setSel(0));
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, show);
    return () => (window.removeEventListener("keydown", onKey), window.removeEventListener(OPEN_PALETTE, show));
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);
  useEffect(() => {
    if (!open || !q.trim()) return setFound(null);
    const t = setTimeout(
      () =>
        fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setFound(d))
          .catch(() => {}),
      150,
    );
    return () => clearTimeout(t);
  }, [q, open]);

  const close = () => setOpen(false);
  const go = (href: string) => (close(), router.push(href));
  const items: Item[] = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    const out: Item[] = [];
    out.push(
      ...[
        { id: "new-task", group: "Actions", label: "New task", icon: <Plus size={15} />, run: () => (close(), openTask(null)) },
        {
          id: "new-note",
          group: "Actions",
          label: "New note",
          icon: <NotebookPen size={15} />,
          run: () => {
            close();
            createNote({}).then((r) => r.ok && r.id && router.push(`/notes?n=${r.id}`));
          },
        },
      ].filter((a) => !words.length || match(a.label)),
    );
    out.push(...PAGES.filter(([, label]) => !words.length || match(label)).map(([href, label, Icon]) => ({ id: `page:${href}`, group: "Go to", label, icon: <Icon size={15} />, run: () => go(href) })));
    // Projects: from what's loaded (instant), then the search results.
    const localProjects = words.length ? projects.filter((p) => match(p.name)).slice(0, 5) : [];
    const projectIds = new Set(localProjects.map((p) => p.id));
    out.push(
      ...[...localProjects, ...(found?.projects ?? []).filter((p) => !projectIds.has(p.id))].map((p) => ({
        id: `project:${p.id}`,
        group: "Projects",
        label: p.name,
        icon: p.emoji ? <span className="text-[14px] leading-none">{p.emoji}</span> : <FolderKanban size={15} />,
        run: () => go(`/projects/${p.id}`),
      })),
    );
    out.push(
      ...(found?.tasks ?? []).map((t) => ({
        id: `task:${t.id}`,
        group: "Tasks",
        label: t.title,
        hint: [t.project, t.done ? "done" : t.dueDate].filter(Boolean).join(" · "),
        icon: <CheckCircle2 size={15} className={t.done ? "text-good" : ""} />,
        run: () => go(`/tasks?task=${t.id}`),
      })),
    );
    out.push(...(found?.notes ?? []).map((n) => ({ id: `note:${n.id}`, group: "Notes", label: n.title, icon: <FileText size={15} />, run: () => go(`/notes?n=${n.id}`) })));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, found, projects]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  let last = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-[580px] overflow-hidden rounded-[16px] border border-hairline bg-surface shadow-[var(--shadow-lift)]" role="dialog" aria-label="Search or jump to">
        <div className="flex items-center gap-2.5 border-b border-hairline px-4">
          <Search size={16} className="text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              else if (e.key === "Enter") (e.preventDefault(), items[sel]?.run());
            }}
            placeholder="Search tasks, projects, notes — or jump to a page…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            style={{ boxShadow: "none" }}
            aria-label="Search"
          />
          <kbd className="rounded-[5px] border border-hairline px-1.5 text-[10.5px] text-ink-3">Esc</kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.map((it, i) => {
            const head = it.group !== last ? ((last = it.group), it.group) : null;
            return (
              <div key={it.id}>
                {head && <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-ink-3">{head}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => sel !== i && setSel(i)}
                  onClick={it.run}
                  className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] ${sel === i ? "bg-surface-2 text-ink" : "text-ink-2"}`}
                >
                  <span className="flex w-4 justify-center text-ink-3">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="shrink-0 truncate text-[11.5px] text-ink-3">{it.hint}</span>}
                  {sel === i && <CornerDownLeft size={13} className="shrink-0 text-ink-3" />}
                </button>
              </div>
            );
          })}
          {!items.length && <p className="px-3 py-6 text-center text-[13px] text-ink-3">{found ? "Nothing found." : "Searching…"}</p>}
        </div>
      </div>
    </div>
  );
}
