"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Bold,
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
import { createFolder, createNote, deleteFolder, deleteNote, findNotes, renameFolder, updateNote } from "@/app/actions";
import { relativeTime } from "@/lib/dates";
import { excerpt, mailtoHref, normalizeTags, noteTitle } from "@/lib/notes";
import type { FolderDTO, NoteDTO } from "@/lib/notes-data";
import { useReport } from "./TaskSheet";

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
      className={`block rounded-[10px] px-3 py-2.5 transition-colors ${active ? "bg-surface-3" : "hover:bg-surface-2"}`}
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
  backHref,
  onChange,
  onDeleted,
}: {
  note: NoteDTO;
  folders: FolderDTO[];
  backHref: string;
  onChange: (n: NoteDTO) => void;
  onDeleted: () => void;
}) {
  const report = useReport();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [folderId, setFolderId] = useState(note.folderId);
  const [pinned, setPinned] = useState(note.pinned);
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
  const change = (patch: Partial<Pick<NoteDTO, "title" | "body" | "tags" | "folderId" | "pinned">>, delay = 700) => {
    const next = { title, body, tags, folderId, pinned, ...patch };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.tags !== undefined) setTags(patch.tags);
    if (patch.folderId !== undefined) setFolderId(patch.folderId);
    if (patch.pinned !== undefined) setPinned(patch.pinned);
    onChange({
      ...note,
      ...next,
      displayTitle: noteTitle(next),
      excerpt: excerpt(next),
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
        <span className="lg:hidden">
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
        <div className="ml-auto flex items-center gap-0.5">
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
        className="mt-3 w-full bg-transparent text-[22px] font-semibold tracking-[-0.02em] outline-none placeholder:text-ink-3"
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
            <option value="">No folder</option>
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

/* ------------------------------------------------------------- workspace */

function FolderRow({ f, href, active }: { f: FolderDTO; href: string; active: boolean }) {
  const report = useReport();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [confirm, setConfirm] = useState(false);
  const [, start] = useTransition();
  if (editing)
    return (
      <form
        className="flex items-center gap-1 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          start(async () => void report(await renameFolder(f.id, name)));
        }}
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input !py-1 !text-[13px]" aria-label="Folder name" onBlur={() => setEditing(false)} />
      </form>
    );
  return (
    <div className="group flex items-center">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-[13.5px] ${active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
      >
        <Folder size={14} className="shrink-0 text-ink-3" />
        <span className="truncate">{f.name}</span>
        <span className="num ml-auto text-[11px] text-ink-3">{f.count}</span>
      </Link>
      {confirm ? (
        <button className="btn btn-danger ml-1 !px-2 !py-0.5 !text-[11.5px]" onClick={() => start(async () => void report(await deleteFolder(f.id)))} onBlur={() => setConfirm(false)}>
          Delete
        </button>
      ) : (
        <span className="ml-0.5 hidden items-center group-hover:flex group-focus-within:flex">
          <button className="rounded p-1 text-ink-3 hover:text-ink" aria-label={`Rename ${f.name}`} onClick={() => setEditing(true)}>
            <Pencil size={12} />
          </button>
          <button className="rounded p-1 text-ink-3 hover:text-bad" aria-label={`Delete ${f.name}`} onClick={() => setConfirm(true)}>
            <Trash2 size={12} />
          </button>
        </span>
      )}
    </div>
  );
}

export function NotesWorkspace({
  notes: initialNotes,
  folders,
  tags,
  open,
  filter,
  total,
  unfiled,
}: {
  notes: NoteDTO[];
  folders: FolderDTO[];
  tags: { tag: string; count: number }[];
  open: NoteDTO | null;
  filter: { q: string; folder?: string; tag?: string };
  total: number;
  unfiled: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const report = useReport();
  const [notes, setNotes] = useState(initialNotes);
  const [q, setQ] = useState(filter.q);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  useEffect(() => setNotes(initialNotes), [initialNotes]);

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

  const shown = useMemo(() => {
    // Keep the list in "last edited first" order while editing (pinned stay on top).
    return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes]);

  const scopeLabel = filter.tag ? `#${filter.tag}` : filter.folder === "none" ? "No folder" : filter.folder ? (folders.find((f) => f.id === filter.folder)?.name ?? "Folder") : "All notes";

  const sidebar = (
    <nav className="space-y-4" aria-label="Folders and tags">
      <div className="flex flex-col gap-px">
        <Link href={url({ folder: undefined, tag: undefined, n: undefined })} aria-current={!filter.folder && !filter.tag ? "page" : undefined} className={`flex items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-[13.5px] ${!filter.folder && !filter.tag ? "bg-surface-3 font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
          All notes <span className="num ml-auto text-[11px] text-ink-3">{total}</span>
        </Link>
        <Link href={url({ folder: "none", tag: undefined, n: undefined })} aria-current={filter.folder === "none" ? "page" : undefined} className={`flex items-center gap-2 rounded-[8px] px-2.5 py-[6px] text-[13.5px] ${filter.folder === "none" ? "bg-surface-3 font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
          No folder <span className="num ml-auto text-[11px] text-ink-3">{unfiled}</span>
        </Link>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="section-label !mb-0">Folders</span>
          <button className="rounded p-1 text-ink-3 hover:text-ink" aria-label="New folder" onClick={() => setNewFolder("")}>
            <FolderPlus size={14} />
          </button>
        </div>
        {newFolder !== null && (
          <form
            className="mb-1 px-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newFolder;
              setNewFolder(null);
              if (name.trim()) startCreate(async () => void report(await createFolder(name)));
            }}
          >
            <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder.trim() && setNewFolder(null)} placeholder="Folder name" className="input !py-1 !text-[13px]" aria-label="New folder name" />
          </form>
        )}
        {folders.map((f) => (
          <FolderRow key={f.id} f={f} href={url({ folder: f.id, tag: undefined, n: undefined })} active={filter.folder === f.id} />
        ))}
        {!folders.length && newFolder === null && <p className="px-2.5 text-[12px] text-ink-3">No folders yet.</p>}
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
  );

  const list = (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes or #tag" aria-label="Search notes" className="input !pl-8 !text-[14px]" />
        </label>
        <button className="btn btn-primary shrink-0" onClick={newNote} disabled={creating} aria-label="New note">
          <Plus size={15} /> <span className="hidden sm:inline">New</span>
        </button>
      </div>
      {/* phones: folders and tags as chips */}
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:hidden">
        <Link href={url({ folder: undefined, tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={!filter.folder && !filter.tag}>
          All
        </Link>
        {folders.map((f) => (
          <Link key={f.id} href={url({ folder: f.id, tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={filter.folder === f.id}>
            <Folder size={11} /> {f.name}
          </Link>
        ))}
        <Link href={url({ folder: "none", tag: undefined })} className="chip inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-pressed={filter.folder === "none"}>
          No folder
        </Link>
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
        <form
          className="mt-2 lg:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newFolder;
            setNewFolder(null);
            if (name.trim()) startCreate(async () => void report(await createFolder(name)));
          }}
        >
          <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder.trim() && setNewFolder(null)} placeholder="New folder name" className="input !text-[14px]" aria-label="New folder name" />
        </form>
      )}
      <div className="mt-3 flex items-center justify-between px-1">
        <span className="section-label !mb-0">{scopeLabel}</span>
        <span className="num text-[11.5px] text-ink-3">{shown.length}</span>
      </div>
      <div className="mt-1 space-y-0.5">
        {shown.map((n) => (
          <NoteListItem key={n.id} n={n} href={url({ n: n.id })} active={open?.id === n.id} />
        ))}
        {!shown.length && (
          <p className="px-3 py-8 text-center text-[13.5px] text-ink-2">{filter.q ? "No notes match that search." : "No notes here yet."}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[200px_300px_minmax(0,1fr)] lg:gap-5">
      <aside className="hidden lg:block">{sidebar}</aside>
      <section className={`card animate-in !p-3 ${open ? "hidden lg:block" : ""} lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto`}>{list}</section>
      {open ? (
        <section className="card animate-in min-w-0">
          <NoteEditor
            key={open.id}
            note={open}
            folders={folders}
            backHref={url({ n: undefined })}
            onChange={(n) => setNotes((l) => (l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [n, ...l]))}
            onDeleted={() => {
              setNotes((l) => l.filter((x) => x.id !== open.id));
              router.replace(url({ n: undefined }));
            }}
          />
        </section>
      ) : (
        <section className="card hidden min-h-[40vh] items-center justify-center text-center lg:flex">
          <div>
            <p className="text-[14px] text-ink-2">Pick a note, or start a new one.</p>
            <button className="btn btn-secondary mt-3" onClick={newNote} disabled={creating}>
              <Plus size={14} /> New note
            </button>
          </div>
        </section>
      )}
    </div>
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
