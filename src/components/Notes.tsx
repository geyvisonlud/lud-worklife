"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Bold,
  ChevronRight,
  FileText,
  CalendarPlus,
  KanbanSquare,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  Rows3,
  Inbox,
  Check,
  CheckSquare,
  Code,
  Copy,
  Folder,
  FolderPlus,
  Hash,
  Heading,
  Italic,
  Link2,
  List,
  Mail,
  Pencil,
  Pin,
  Plus,
  Quote,
  Search,
  Share,
  Trash2,
  X,
} from "lucide-react";
import { createFolder, createNote, deleteFolder, deleteNote, findNotes, noteToEvent, noteToProject, renameFolder, updateNote } from "@/app/actions";
import { PROJECT_COLORS } from "@/lib/colors";
import { formatDay, relativeTime } from "@/lib/dates";
import { continueList, excerpt, mailtoHref, normalizeTags, noteTitle } from "@/lib/notes";
import type { FolderDTO, NoteDTO } from "@/lib/notes-data";
import { Field, Sheet } from "./Sheet";
import { useReport, useWork } from "./TaskSheet";

export type NoteCalendar = { id: string; label: string; color: string };

/** Card / editor background for a colored note (a soft tint of the palette color). */
export function noteTint(color: string | null | undefined): React.CSSProperties | undefined {
  const c = color ? PROJECT_COLORS[color] : undefined;
  if (!c) return undefined;
  return { background: `color-mix(in srgb, ${c.hex} 13%, var(--surface))`, borderColor: `color-mix(in srgb, ${c.hex} 30%, transparent)` };
}

function useIsDesktop() {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

/* -------------------------------------------------------------- Markdown */

/** Rendered Markdown (GitHub flavor: tables, checklists, strikethrough). Raw HTML is never rendered. Checklist boxes toggle the source line. */
export function Markdown({ text, onToggleTask }: { text: string; onToggleTask?: (line: number) => void }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" />,
          li: ({ node, children, className, ...p }) => {
            const line = node?.position?.start.line;
            if (className?.includes("task-list-item") && onToggleTask && line) {
              return (
                <li
                  className={className}
                  {...p}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName === "INPUT") onToggleTask(line - 1);
                  }}
                >
                  {children}
                </li>
              );
            }
            return (
              <li className={className} {...p}>
                {children}
              </li>
            );
          },
          input: ({ node: _n, ...p }) => <input {...p} disabled={!onToggleTask} readOnly />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Flip "- [ ]" ↔ "- [x]" on one line of the source. */
function toggleTaskLine(body: string, line: number) {
  const lines = body.split("\n");
  const l = lines[line];
  if (l === undefined) return body;
  lines[line] = /\[ \]/.test(l) ? l.replace("[ ]", "[x]") : l.replace(/\[(x|X)\]/, "[ ]");
  return lines.join("\n");
}

/* ---------------------------------------------------------------- pieces */

function TagChips({ tags, small }: { tags: string[]; small?: boolean }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex min-w-0 flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className={`rounded-full bg-surface-2 px-1.5 text-ink-2 ${small ? "text-[10.5px]" : "text-[11.5px]"}`}>
          #{t}
        </span>
      ))}
    </span>
  );
}

function NoteListItem({ n, href, active }: { n: NoteDTO; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`block rounded-[10px] border-l-[3px] px-3 py-2.5 transition-colors ${active ? "bg-surface-3" : "hover:bg-surface-2"}`}
      style={{ borderLeftColor: n.color && PROJECT_COLORS[n.color] ? PROJECT_COLORS[n.color].hex : "transparent" }}
    >
      <div className="flex items-center gap-1.5">
        {n.pinned && <Pin size={11} className="shrink-0 text-ink-3" aria-label="Pinned" />}
        <span className="truncate text-[14px] font-medium">{n.displayTitle}</span>
      </div>
      {n.excerpt && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{n.excerpt}</p>}
      <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-ink-3">
        <span className="shrink-0">{relativeTime(new Date(n.updatedAt))}</span>
        {n.folderName && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <Folder size={10} className="shrink-0" />
            {n.folderName}
          </span>
        )}
        <TagChips tags={n.tags.slice(0, 3)} small />
        <LinkIcons n={n} />
      </div>
    </Link>
  );
}

function LinkIcons({ n }: { n: NoteDTO }) {
  return (
    <>
      {n.project && <KanbanSquare size={11} className="shrink-0" aria-label={`Project: ${n.project.name}`} />}
      {n.event && <CalendarPlus size={11} className="shrink-0" aria-label="On the calendar" />}
    </>
  );
}

/** A note as a box (grid view): tinted with its color, more of the text shown. */
function NoteCard({ n, href }: { n: NoteDTO; href: string }) {
  return (
    <Link href={href} className="mb-3 block break-inside-avoid rounded-[14px] border border-hairline bg-surface p-3.5 transition-shadow hover:shadow-[var(--shadow-lift)]" style={noteTint(n.color)}>
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">{n.displayTitle}</span>
        {n.pinned && <Pin size={12} className="mt-1 shrink-0 text-ink-3" aria-label="Pinned" />}
      </div>
      {n.excerpt && <p className="mt-1.5 line-clamp-[8] whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{n.excerpt}</p>}
      {n.tags.length > 0 && (
        <div className="mt-2">
          <TagChips tags={n.tags.slice(0, 4)} small />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
        <span>{relativeTime(new Date(n.updatedAt))}</span>
        {n.folderName && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <Folder size={10} className="shrink-0" />
            {n.folderName}
          </span>
        )}
        <LinkIcons n={n} />
      </div>
    </Link>
  );
}

/** Wraps the selection in the textarea with Markdown (or prefixes the line). */
function applyFormat(el: HTMLTextAreaElement, kind: string): { value: string; start: number; end: number } {
  const { value, selectionStart: s, selectionEnd: e } = el;
  const sel = value.slice(s, e);
  const wrap = (a: string, b = a, placeholder = "text") => {
    const inner = sel || placeholder;
    const v = value.slice(0, s) + a + inner + b + value.slice(e);
    return { value: v, start: s + a.length, end: s + a.length + inner.length };
  };
  const linePrefix = (prefix: string) => {
    const ls = value.lastIndexOf("\n", s - 1) + 1;
    const v = value.slice(0, ls) + prefix + value.slice(ls);
    return { value: v, start: s + prefix.length, end: e + prefix.length };
  };
  switch (kind) {
    case "bold":
      return wrap("**");
    case "italic":
      return wrap("_");
    case "code":
      return sel.includes("\n") ? wrap("```\n", "\n```", "code") : wrap("`", "`", "code");
    case "link": {
      const inner = sel || "link";
      const v = value.slice(0, s) + `[${inner}](https://)` + value.slice(e);
      const urlAt = s + inner.length + 3;
      return { value: v, start: urlAt, end: urlAt + 8 };
    }
    case "h":
      return linePrefix("## ");
    case "ul":
      return linePrefix("- ");
    case "task":
      return linePrefix("- [ ] ");
    case "quote":
      return linePrefix("> ");
    default:
      return { value, start: s, end: e };
  }
}

const TOOLS = [
  { kind: "h", icon: Heading, label: "Heading" },
  { kind: "bold", icon: Bold, label: "Bold" },
  { kind: "italic", icon: Italic, label: "Italic" },
  { kind: "ul", icon: List, label: "Bulleted list" },
  { kind: "task", icon: CheckSquare, label: "Checklist" },
  { kind: "quote", icon: Quote, label: "Quote" },
  { kind: "code", icon: Code, label: "Code" },
  { kind: "link", icon: Link2, label: "Link" },
];

/* ---------------------------------------------------------------- editor */

type Saved = "saved" | "saving" | "error";

function NoteEditor({
  note,
  folders,
  calendars,
  backHref,
  modal,
  onChange,
  onDeleted,
}: {
  note: NoteDTO;
  folders: FolderDTO[];
  calendars: NoteCalendar[];
  backHref: string;
  /** Shown over the grid on desktop: a close button instead of the back arrow. */
  modal?: boolean;
  onChange: (n: NoteDTO) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const report = useReport();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [folderId, setFolderId] = useState(note.folderId);
  const [pinned, setPinned] = useState(note.pinned);
  const [color, setColor] = useState(note.color);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [eventSheet, setEventSheet] = useState(false);
  const [busy, startBusy] = useTransition();
  const [mode, setMode] = useState<"write" | "preview">(note.body.trim() ? "preview" : "write");
  const [saved, setSaved] = useState<Saved>("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});
  const [, start] = useTransition();

  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const data = pending.current;
    pending.current = {};
    if (!Object.keys(data).length) return;
    setSaved("saving");
    start(async () => {
      const r = await updateNote(note.id, data);
      setSaved(r.ok ? "saved" : "error");
      if (!r.ok) report(r);
    });
  };
  // Save on leave (switching notes, closing the tab).
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Local update right away (the list follows), saved to the server shortly after typing stops. */
  const change = (patch: Partial<Pick<NoteDTO, "title" | "body" | "tags" | "folderId" | "pinned" | "color">>, delay = 700) => {
    const next = { title, body, tags, folderId, pinned, color, ...patch };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.tags !== undefined) setTags(patch.tags);
    if (patch.folderId !== undefined) setFolderId(patch.folderId);
    if (patch.pinned !== undefined) setPinned(patch.pinned);
    if (patch.color !== undefined) setColor(patch.color);
    onChange({
      ...note,
      ...next,
      displayTitle: noteTitle(next),
      excerpt: excerpt(next, 400),
      folderName: folders.find((f) => f.id === next.folderId)?.name ?? null,
      updatedAt: new Date().toISOString(),
    });
    Object.assign(pending.current, patch);
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  const addTags = (raw: string) => {
    const add = normalizeTags(raw).filter((t) => !tags.includes(t));
    setTagDraft("");
    if (add.length) change({ tags: [...tags, ...add] }, 0);
  };

  const format = (kind: string) => {
    const el = area.current;
    if (!el) return;
    const r = applyFormat(el, kind);
    change({ body: r.value });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };

  const current = { title, body, tags };
  const share = async () => {
    try {
      await navigator.share({ title: noteTitle(current), text: body });
    } catch {
      /* cancelled */
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(title.trim() ? `# ${title.trim()}\n\n${body}` : body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className="flex min-h-0 flex-col">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline pb-2.5">
        <span className={modal ? "hidden" : "lg:hidden"}>
          <Link href={backHref} className="btn btn-ghost !px-2" aria-label="Back to notes">
            <ArrowLeft size={16} />
          </Link>
        </span>
        <div className="flex rounded-[9px] bg-surface-2 p-0.5 text-[12.5px]" role="tablist" aria-label="Mode">
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-[7px] px-2.5 py-1 font-medium capitalize ${mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
            >
              {m === "write" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
        <span className="ml-1 text-[11.5px] text-ink-3" aria-live="polite">
          {saved === "saving" ? "Saving…" : saved === "error" ? "Not saved" : "Saved"}
        </span>
        <div className="relative ml-auto flex items-center gap-0.5">
          <button className="btn btn-ghost !px-2" aria-label="Note color" title="Color" aria-expanded={palette} onClick={() => (setPalette((v) => !v), setMenu(false))}>
            <Palette size={15} />
          </button>
          {palette && (
            <div className="absolute right-0 top-full z-20 mt-1 flex gap-1.5 rounded-[12px] border border-hairline bg-surface p-2 shadow-[var(--shadow-lift)]" role="listbox" aria-label="Note color">
              <button
                role="option"
                aria-selected={!color}
                aria-label="No color"
                onClick={() => (change({ color: null }, 0), setPalette(false))}
                className={`h-6 w-6 rounded-full border border-hairline-strong bg-surface ${!color ? "ring-2 ring-[var(--ink-2)] ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
              />
              {Object.entries(PROJECT_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  role="option"
                  aria-selected={color === key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => (change({ color: key }, 0), setPalette(false))}
                  className={`h-6 w-6 rounded-full ${color === key ? "ring-2 ring-[var(--ink-2)] ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          )}
          <button className={`btn btn-ghost !px-2 ${pinned ? "text-accent" : ""}`} aria-pressed={pinned} aria-label={pinned ? "Unpin" : "Pin to top"} title={pinned ? "Unpin" : "Pin to top"} onClick={() => change({ pinned: !pinned }, 0)}>
            <Pin size={15} />
          </button>
          <a className="btn btn-ghost !px-2" href={mailtoHref(current)} aria-label="Share by e-mail" title="Share by e-mail" onClick={flush}>
            <Mail size={15} />
          </a>
          {canShare && (
            <button className="btn btn-ghost !px-2" onClick={share} aria-label="Share…" title="Share…">
              <Share size={15} />
            </button>
          )}
          <button className="btn btn-ghost !px-2" onClick={copy} aria-label="Copy as Markdown" title="Copy as Markdown">
            {copied ? <Check size={15} className="text-good" /> : <Copy size={15} />}
          </button>
          <button className="btn btn-ghost !px-2" aria-label="More actions" title="More" aria-expanded={menu} onClick={() => (setMenu((v) => !v), setPalette(false))}>
            <MoreHorizontal size={15} />
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-[12px] border border-hairline bg-surface p-1 shadow-[var(--shadow-lift)]" role="menu">
              {note.project ? (
                <Link role="menuitem" href={`/projects/${note.project.id}`} className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[13.5px] hover:bg-surface-2">
                  <KanbanSquare size={14} className="text-ink-3" /> Open project
                </Link>
              ) : (
                <button
                  role="menuitem"
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-2"
                  onClick={() =>
                    startBusy(async () => {
                      flush();
                      const r = await noteToProject(note.id);
                      setMenu(false);
                      if (report(r) && r.projectId) router.push(`/projects/${r.projectId}`);
                    })
                  }
                >
                  <KanbanSquare size={14} className="text-ink-3" /> Make it a project
                </button>
              )}
              <button role="menuitem" className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-2" onClick={() => (setMenu(false), flush(), setEventSheet(true))}>
                <CalendarPlus size={14} className="text-ink-3" /> Add to calendar…
              </button>
            </div>
          )}
          {modal && (
            <Link href={backHref} className="btn btn-ghost !px-2" aria-label="Close note" title="Close">
              <X size={16} />
            </Link>
          )}
          {confirmDelete ? (
            <button
              className="btn btn-danger !py-1"
              onClick={() =>
                start(async () => {
                  if (timer.current) clearTimeout(timer.current);
                  pending.current = {};
                  if (report(await deleteNote(note.id))) onDeleted();
                })
              }
            >
              Delete note
            </button>
          ) : (
            <button className="btn btn-ghost !px-2" onClick={() => setConfirmDelete(true)} aria-label="Delete note" title="Delete note">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* title + meta */}
      <input
        value={title}
        onChange={(e) => change({ title: e.target.value })}
        placeholder={noteTitle({ title: "", body }) === "Untitled note" ? "Title" : noteTitle({ title: "", body })}
        aria-label="Title"
        className={`mt-3 w-full bg-transparent font-semibold tracking-[-0.03em] outline-none placeholder:text-ink-3 ${modal ? "text-[36px] leading-tight" : "text-[22px]"}`}
        maxLength={200}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-2 pr-1 text-ink-2">
          <Folder size={12} />
          <select
            value={folderId ?? ""}
            onChange={(e) => change({ folderId: e.target.value || null }, 0)}
            className="max-w-[160px] bg-transparent pr-1 outline-none"
            aria-label="Folder"
          >
            <option value="">Inbox</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 py-0.5 pl-2 pr-1 text-ink-2">
            #{t}
            <button aria-label={`Remove tag ${t}`} onClick={() => change({ tags: tags.filter((x) => x !== t) }, 0)} className="rounded-full p-0.5 hover:text-ink">
              <X size={11} />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-ink-3">
          <Hash size={12} />
          <input
            value={tagDraft}
            onChange={(e) => {
              const v = e.target.value;
              if (/[,\s]$/.test(v)) addTags(v);
              else setTagDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTags(tagDraft);
              }
              if (e.key === "Backspace" && !tagDraft && tags.length) change({ tags: tags.slice(0, -1) }, 0);
            }}
            onBlur={() => tagDraft && addTags(tagDraft)}
            placeholder="Add tag"
            aria-label="Add tag"
            className="w-20 bg-transparent text-ink outline-none placeholder:text-ink-3"
          />
        </span>
      </div>

      {(note.project || note.event) && (
        <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
          {note.project && (
            <Link href={`/projects/${note.project.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-ink-2 hover:text-ink">
              <KanbanSquare size={12} /> {note.project.name}
            </Link>
          )}
          {note.event && (
            <Link href="/calendar" className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-ink-2 hover:text-ink">
              <CalendarPlus size={12} /> <EventWhen e={note.event} />
            </Link>
          )}
        </div>
      )}

      <AddToCalendar open={eventSheet} onClose={() => setEventSheet(false)} noteId={note.id} calendars={calendars} />

      {/* body */}
      {mode === "write" ? (
        <>
          <div className="mt-3 flex flex-wrap gap-0.5 border-y border-hairline py-1" role="toolbar" aria-label="Formatting">
            {TOOLS.map(({ kind, icon: Icon, label }) => (
              <button key={kind} type="button" className="rounded-[7px] p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => format(kind)}>
                <Icon size={15} />
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            value={body}
            onChange={(e) => change({ body: e.target.value })}
            onKeyDown={(e) => {
              // Enter in a list keeps the list going (a new "- [ ] " item); Enter on an empty item ends it.
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              const el = e.currentTarget;
              const r = continueList(el.value, el.selectionStart, el.selectionEnd);
              if (!r) return;
              e.preventDefault();
              change({ body: r.text });
              requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
            }}
            onBlur={flush}
            placeholder={"Write in Markdown — # heading, **bold**, - [ ] checklist…"}
            aria-label="Note text (Markdown)"
            className="mt-2 min-h-[50vh] w-full flex-1 resize-none bg-transparent font-mono text-[14px] leading-[1.65] outline-none placeholder:text-ink-3"
            autoFocus={!note.body}
          />
        </>
      ) : (
        <div className="mt-4 min-h-[30vh] cursor-text" onDoubleClick={() => setMode("write")}>
          {body.trim() ? (
            <Markdown text={body} onToggleTask={(line) => change({ body: toggleTaskLine(body, line) }, 300)} />
          ) : (
            <button className="text-[14px] text-ink-3" onClick={() => setMode("write")}>
              Empty note — tap Edit to write.
            </button>
          )}
        </div>
      )}
      <p className="mt-4 text-[11.5px] text-ink-3">
        Created {relativeTime(new Date(note.createdAt))} · edited {relativeTime(new Date(note.updatedAt))}
      </p>
    </article>
  );
}

function EventWhen({ e }: { e: NonNullable<NoteDTO["event"]> }) {
  const { tz } = useWork();
  const d = new Date(e.start);
  const day = e.allDay ? e.start.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const time = e.allDay ? "all day" : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  return (
    <>
      {formatDay(day)} · {time}
      {e.calendar ? ` · ${e.calendar}` : ""}
    </>
  );
}

/** "Add to calendar": which calendar, the day, and a time (or all day). */
function AddToCalendar({ open, onClose, noteId, calendars }: { open: boolean; onClose: () => void; noteId: string; calendars: NoteCalendar[] }) {
  const { today } = useWork();
  const report = useReport();
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [pending, start] = useTransition();
  return (
    <Sheet open={open} onClose={onClose} title="Add to calendar">
      {calendars.length ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (report(await noteToEvent(noteId, { calendarId, date, time: allDay ? null : time, durationMin: duration }))) onClose();
            });
          }}
        >
          <Field label="Calendar">
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="input !text-[14px]">
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input !text-[14px]" />
            </Field>
            <Field label="Time">
              <input type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} className="input !text-[14px] disabled:opacity-40" />
            </Field>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Length">
              <select value={duration} disabled={allDay} onChange={(e) => setDuration(Number(e.target.value))} className="input !text-[14px] disabled:opacity-40">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h`.replace(".5 h", " h 30")}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 pb-2.5 text-[14px]">
              <input type="checkbox" className="switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
            </label>
          </div>
          <p className="text-[12px] text-ink-3">The note's title becomes the event; its text goes in the description, with a link back here.</p>
          <button className="btn btn-primary w-full" disabled={pending || !calendarId}>
            <CalendarPlus size={15} /> {pending ? "Adding…" : "Add event"}
          </button>
        </form>
      ) : (
        <p className="text-[14px] text-ink-2">
          No calendar you can add events to yet. Connect a Google account in <Link href="/connections" className="text-accent underline">Connections</Link>.
        </p>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------- workspace */

type View = "list" | "grid";
const VIEW_KEY = "lw:notes-view";
const TREE_KEY = "lw:notes-tree";
export type TreeNote = { id: string; title: string; folderId: string | null; pinned: boolean; color: string | null };

export function NotesWorkspace({
  notes: initialNotes,
  folders,
  tags,
  open,
  filter,
  total,
  unfiled,
  calendars,
  tree,
}: {
  tree: TreeNote[];
  notes: NoteDTO[];
  folders: FolderDTO[];
  tags: { tag: string; count: number }[];
  open: NoteDTO | null;
  filter: { q: string; folder?: string; tag?: string };
  total: number;
  unfiled: number;
  calendars: NoteCalendar[];
}) {
  const router = useRouter();
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(["inbox"]));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TREE_KEY) ?? "null");
      if (Array.isArray(saved)) setOpenFolders(new Set(saved));
    } catch {
      /* private mode */
    }
  }, []);
  const toggleFolder = (id: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(TREE_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  const pathname = usePathname();
  const params = useSearchParams();
  const report = useReport();
  const desktop = useIsDesktop();
  const [notes, setNotes] = useState(initialNotes);
  const [q, setQ] = useState(filter.q);
  const [view, setView] = useState<View>("list");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  useEffect(() => setNotes(initialNotes), [initialNotes]);
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "list") setView(v);
    } catch {
      /* private mode */
    }
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const url = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(o)) v ? p.set(k, v) : p.delete(k);
    const s = p.toString();
    return `${pathname}${s ? `?${s}` : ""}`;
  };
  // Search as you type (the URL keeps it, so back/forward and reloads keep the results).
  useEffect(() => {
    if (q === filter.q) return;
    const t = setTimeout(() => router.replace(url({ q: q || undefined }), { scroll: false }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const newNote = () =>
    startCreate(async () => {
      const folderId = filter.folder && filter.folder !== "none" ? filter.folder : null;
      const r = await createNote({ folderId, tags: filter.tag ? [filter.tag] : [] });
      if (report(r) && r.id) router.push(url({ n: r.id }));
    });
  const addFolder = (name: string) => {
    setNewFolder(null);
    if (name.trim()) startCreate(async () => void report(await createFolder(name)));
  };

  // Last edited first while editing (pinned stay on top).
  const shown = useMemo(() => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [notes]);
  const current = open ? (notes.find((n) => n.id === open.id) ?? open) : null;

  const isAll = !filter.folder && !filter.tag;
  const scopeLabel = filter.tag ? `#${filter.tag}` : filter.folder === "none" ? "Inbox" : filter.folder ? (folders.find((f) => f.id === filter.folder)?.name ?? "Folder") : "All notes";
  const navCls = (on: boolean) => `flex items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-[13.5px] ${on ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`;

  const viewToggle = (
    <div className="flex shrink-0 rounded-[9px] bg-surface-2 p-0.5" role="group" aria-label="View">
      {(
        [
          ["list", Rows3, "List"],
          ["grid", LayoutGrid, "Boxes"],
        ] as const
      ).map(([v, Icon, label]) => (
        <button key={v} aria-pressed={view === v} aria-label={`${label} view`} title={label} onClick={() => pickView(v)} className={`rounded-[7px] p-1.5 ${view === v ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  );

  const header = (
    <>
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes or #tag" aria-label="Search notes" className="input !pl-8 !text-[14px]" />
        </label>
        {viewToggle}
        <button className="btn btn-primary shrink-0" onClick={newNote} disabled={creating} aria-label="New note">
          <Plus size={15} /> <span className="hidden sm:inline">New</span>
        </button>
      </div>
      {/* phones: Inbox, folders and tags as chips */}
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:hidden">
        <Link href={url({ folder: undefined, tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={isAll}>
          All
        </Link>
        <Link href={url({ folder: "none", tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={filter.folder === "none"}>
          <Inbox size={11} /> Inbox
        </Link>
        {folders.map((f) => (
          <Link key={f.id} href={url({ folder: f.id, tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={filter.folder === f.id}>
            <Folder size={11} /> {f.name}
          </Link>
        ))}
        {tags.map((t) => (
          <Link key={t.tag} href={url({ tag: filter.tag === t.tag ? undefined : t.tag, folder: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={filter.tag === t.tag}>
            #{t.tag}
          </Link>
        ))}
        <button className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" onClick={() => setNewFolder("")}>
          <FolderPlus size={11} /> Folder
        </button>
      </div>
      {newFolder !== null && (
        <form className="mt-2 lg:hidden" onSubmit={(e) => (e.preventDefault(), addFolder(newFolder))}>
          <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder.trim() && setNewFolder(null)} placeholder="New folder name" className="input !text-[14px]" aria-label="New folder name" />
        </form>
      )}
      <div className="mt-3 flex items-center justify-between px-1">
        <span className="section-label !mb-0">{scopeLabel}</span>
        <span className="num text-[11.5px] text-ink-3">{shown.length}</span>
      </div>
    </>
  );

  const empty = <p className="px-3 py-8 text-center text-[13.5px] text-ink-2">{filter.q ? "No notes match that search." : "No notes here yet."}</p>;

  const editor = current && (
    <NoteEditor
      key={current.id}
      note={current}
      folders={folders}
      calendars={calendars}
      backHref={url({ n: undefined })}
      modal={desktop}
      onChange={(n) => setNotes((l) => (l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [n, ...l]))}
      onDeleted={() => {
        setNotes((l) => l.filter((x) => x.id !== current.id));
        router.replace(url({ n: undefined }));
      }}
    />
  );

  // Esc closes the note shown over the boxes.
  useEffect(() => {
    if (!(current && desktop)) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.replace(url({ n: undefined }), { scroll: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, desktop]);

  // The open note's folder unfolds in the tree.
  useEffect(() => {
    if (!current) return;
    const id = current.folderId ?? "inbox";
    setOpenFolders((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, [current?.id, current?.folderId]);

  // Phones: an open note takes the whole screen in both views.
  if (current && !desktop) {
    return (
      <section className="card animate-in min-w-0" style={noteTint(current.color)}>
        {editor}
      </section>
    );
  }

  // Phones: list or boxes, the note full screen (above).
  if (!desktop) {
    return (
      <div>
        <section className="card animate-in !p-3">{header}</section>
        {view === "grid" ? (
          <div className="mt-4 columns-2 gap-3">
            {shown.map((n) => (
              <NoteCard key={n.id} n={n} href={url({ n: n.id })} />
            ))}
          </div>
        ) : (
          <section className="card animate-in mt-3 !p-2">
            {shown.map((n) => (
              <NoteListItem key={n.id} n={n} href={url({ n: n.id })} />
            ))}
          </section>
        )}
        {!shown.length && empty}
      </div>
    );
  }

  /* ---------- desktop: Notion-like — page tree on the left, the note (or the collection) full width on the right */
  // Titles follow what's typed in the open note.
  const liveTree = tree.map((t) => {
    const n = notes.find((x) => x.id === t.id);
    return n ? { ...t, title: n.displayTitle, folderId: n.folderId, pinned: n.pinned, color: n.color } : t;
  });
  const byFolder = (fid: string | null) => liveTree.filter((t) => t.folderId === fid);
  const pinned = liveTree.filter((t) => t.pinned);
  const treeLink = (t: TreeNote, depth = 1) => {
    const active = current?.id === t.id;
    return (
      <Link
        key={`${depth}-${t.id}`}
        href={url({ n: t.id })}
        aria-current={active ? "page" : undefined}
        className={`flex min-w-0 items-center gap-2 rounded-[7px] py-[5px] pr-2 text-[13px] ${active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        <FileText size={13} className="shrink-0" style={{ color: t.color && PROJECT_COLORS[t.color] ? PROJECT_COLORS[t.color].hex : "var(--ink-3)" }} />
        <span className="truncate">{t.title}</span>
      </Link>
    );
  };
  const group = (id: string, label: React.ReactNode, icon: React.ReactNode, items: TreeNote[], href: string, active: boolean, extra?: React.ReactNode) => {
    const isOpen = openFolders.has(id);
    return (
      <div key={id}>
        <div className={`group flex items-center rounded-[7px] ${active ? "bg-surface-3" : "hover:bg-surface-2"}`}>
          <button className="rounded p-1 pl-1.5 text-ink-3 hover:text-ink" onClick={() => toggleFolder(id)} aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={isOpen}>
            <ChevronRight size={13} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>
          <Link href={href} className={`flex min-w-0 flex-1 items-center gap-2 py-[5px] pr-2 text-[13.5px] ${active ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}>
            {icon}
            <span className="truncate">{label}</span>
            <span className="num ml-auto text-[11px] text-ink-3">{items.length}</span>
          </Link>
          {extra}
        </div>
        {isOpen && (
          <div>
            {items.map((t) => treeLink(t))}
            {!items.length && <p className="py-1 text-[12px] text-ink-3" style={{ paddingLeft: 38 }}>Empty</p>}
          </div>
        )}
      </div>
    );
  };

  const notionSidebar = (
    <aside className="sticky top-6 flex h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-[16px] border border-hairline bg-[var(--card-bg)] backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
        <NotebookIcon />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Notes</span>
        <span className="num text-[12px] text-ink-3">{total}</span>
        <button className="ml-auto rounded-[7px] p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={newNote} disabled={creating} aria-label="New note" title="New note">
          <Plus size={16} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <label className="relative block">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or #tag" aria-label="Search notes" className="input !rounded-[8px] !py-1.5 !pl-7 !text-[13px]" />
        </label>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto px-2 pb-3" aria-label="Notes">
        <div className="flex flex-col gap-px">
          <Link href={url({ folder: undefined, tag: undefined, n: undefined })} aria-current={isAll && !current ? "page" : undefined} className={navCls(isAll && !current)}>
            <Rows3 size={14} className="shrink-0 text-ink-3" /> All notes <span className="num ml-auto text-[11px] text-ink-3">{total}</span>
          </Link>
        </div>
        {pinned.length > 0 && (
          <div>
            <div className="section-label mb-0.5 px-2.5">Pinned</div>
            {pinned.map((t) => treeLink(t, 0))}
          </div>
        )}
        <div>
          <div className="mb-0.5 flex items-center justify-between pl-2.5 pr-1">
            <span className="section-label !mb-0">Folders</span>
            <button className="rounded p-1 text-ink-3 hover:text-ink" aria-label="New folder" title="New folder" onClick={() => setNewFolder("")}>
              <FolderPlus size={14} />
            </button>
          </div>
          {newFolder !== null && (
            <form className="mb-1 px-1" onSubmit={(e) => (e.preventDefault(), addFolder(newFolder))}>
              <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder.trim() && setNewFolder(null)} placeholder="Folder name" className="input !py-1 !text-[13px]" aria-label="New folder name" />
            </form>
          )}
          {group("inbox", "Inbox", <Inbox size={14} className="shrink-0 text-ink-3" />, byFolder(null), url({ folder: "none", tag: undefined, n: undefined }), filter.folder === "none" && !current)}
          {folders.map((f) => (
            <FolderTreeRow key={f.id} f={f} active={filter.folder === f.id && !current}>
              {(extra) =>
                group(f.id, f.name, <Folder size={14} className="shrink-0 text-ink-3" />, byFolder(f.id), url({ folder: f.id, tag: undefined, n: undefined }), filter.folder === f.id && !current, extra)
              }
            </FolderTreeRow>
          ))}
        </div>
        {tags.length > 0 && (
          <div>
            <div className="section-label mb-1 px-2.5">Tags</div>
            <div className="flex flex-wrap gap-1 px-1.5">
              {tags.map((t) => (
                <Link key={t.tag} href={url({ tag: filter.tag === t.tag ? undefined : t.tag, folder: undefined, n: undefined })} className="chip !text-[12px]" aria-pressed={filter.tag === t.tag}>
                  #{t.tag} <span className="text-ink-3">{t.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );

  return (
    <div className="grid grid-cols-[264px_minmax(0,1fr)] items-start gap-6">
      {notionSidebar}
      <div className="min-w-0">
        {current ? (
          <section className="animate-in min-h-[calc(100vh-3rem)] rounded-[16px] border border-hairline px-10 py-6 xl:px-16" style={{ background: "var(--surface)", ...noteTint(current.color) }}>
            {editor}
          </section>
        ) : (
          <section className="animate-in">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="label-mono mb-1.5">Notes</div>
                <h1 className="truncate text-[30px] font-semibold tracking-[-0.03em]">{scopeLabel}</h1>
                <p className="text-[13px] text-ink-3">
                  {shown.length} note{shown.length === 1 ? "" : "s"}
                  {filter.q ? ` matching “${filter.q}”` : ""} · last edited first
                </p>
              </div>
              {viewToggle}
              <button className="btn btn-primary" onClick={newNote} disabled={creating}>
                <Plus size={15} /> New note
              </button>
            </div>
            {view === "grid" ? (
              <div className="columns-2 gap-3 xl:columns-3 2xl:columns-4">
                {shown.map((n) => (
                  <NoteCard key={n.id} n={n} href={url({ n: n.id })} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] border border-hairline bg-[var(--card-bg-strong)]">
                <div className="grid grid-cols-[minmax(0,1fr)_160px_200px_110px] gap-3 border-b border-hairline bg-surface-2/60 px-4 py-2 text-[11.5px] font-medium text-ink-3">
                  <span>Name</span>
                  <span>Folder</span>
                  <span>Tags</span>
                  <span className="text-right">Edited</span>
                </div>
                {shown.map((n) => (
                  <Link key={n.id} href={url({ n: n.id })} className="grid grid-cols-[minmax(0,1fr)_160px_200px_110px] items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileText size={15} className="shrink-0" style={{ color: n.color && PROJECT_COLORS[n.color] ? PROJECT_COLORS[n.color].hex : "var(--ink-3)" }} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] font-medium">{n.displayTitle}</span>
                          {n.pinned && <Pin size={11} className="shrink-0 text-ink-3" />}
                          <LinkIcons n={n} />
                        </span>
                        {n.excerpt && <span className="block truncate text-[12px] text-ink-3">{n.excerpt}</span>}
                      </span>
                    </span>
                    <span className="truncate text-[12.5px] text-ink-2">{n.folderName ?? "Inbox"}</span>
                    <span className="min-w-0 truncate">
                      <TagChips tags={n.tags.slice(0, 3)} small />
                    </span>
                    <span className="num text-right text-[12px] text-ink-3">{relativeTime(new Date(n.updatedAt))}</span>
                  </Link>
                ))}
              </div>
            )}
            {!shown.length && empty}
          </section>
        )}
      </div>
    </div>
  );
}

/** A folder in the tree, with rename / delete on hover (passed to the row as `extra`). */
function FolderTreeRow({ f, active, children }: { f: FolderDTO; active: boolean; children: (extra: React.ReactNode) => React.ReactNode }) {
  const report = useReport();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [confirm, setConfirm] = useState(false);
  const [, start] = useTransition();
  void active;
  if (editing)
    return (
      <form
        className="px-1 py-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          start(async () => void report(await renameFolder(f.id, name)));
        }}
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input !py-1 !text-[13px]" aria-label="Folder name" onBlur={() => setEditing(false)} />
      </form>
    );
  const extra = confirm ? (
    <button className="btn btn-danger mr-1 !px-2 !py-0.5 !text-[11px]" onClick={() => start(async () => void report(await deleteFolder(f.id)))} onBlur={() => setConfirm(false)}>
      Delete
    </button>
  ) : (
    <span className="mr-1 hidden items-center group-hover:flex group-focus-within:flex">
      <button className="rounded p-1 text-ink-3 hover:text-ink" aria-label={`Rename ${f.name}`} onClick={() => setEditing(true)}>
        <Pencil size={12} />
      </button>
      <button className="rounded p-1 text-ink-3 hover:text-bad" aria-label={`Delete ${f.name}`} onClick={() => setConfirm(true)}>
        <Trash2 size={12} />
      </button>
    </span>
  );
  return <>{children(extra)}</>;
}

function NotebookIcon() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-surface-2 text-ink-2">
      <FileText size={14} />
    </span>
  );
}

/* ------------------------------------------------------------- Today box */

/** "Notes" on Today: the last edited or added notes, with search. */
export function NotesBox({ notes }: { notes: NoteDTO[] }) {
  const router = useRouter();
  const report = useReport();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NoteDTO[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [creating, startCreate] = useTransition();
  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => startSearch(async () => setResults(await findNotes(q))), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = results ?? notes;

  return (
    <section className="card animate-in">
      <div className="card-head flex items-center justify-between gap-3">
        <h2 className="label-mono">
          <Link href="/notes" className="hover:text-ink">
            Notes ›
          </Link>
        </h2>
        <button
          className="btn btn-ghost !px-2 !py-1 text-[12.5px]"
          disabled={creating}
          onClick={() =>
            startCreate(async () => {
              const r = await createNote();
              if (report(r) && r.id) router.push(`/notes?n=${r.id}`);
            })
          }
        >
          <Plus size={14} /> New note
        </button>
      </div>
      <label className="relative block">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes or #tag" aria-label="Search notes" className="input !pl-8 !text-[14px]" />
      </label>
      <div className={`mt-2 transition-opacity ${searching ? "opacity-60" : ""}`}>
        {list.map((n) => (
          <NoteListItem key={n.id} n={n} href={`/notes?n=${n.id}`} />
        ))}
        {!list.length && (
          <p className="py-6 text-center text-[13.5px] text-ink-2">{q.trim() ? "No notes match that search." : "No notes yet — jot something down."}</p>
        )}
      </div>
    </section>
  );
}
