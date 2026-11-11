"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BookOpenText, BookmarkPlus, Check, Copy, NotebookPen, Settings2, X, ExternalLink, FileUp, KeyRound, RotateCcw, Smartphone, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addReadLater, deleteReadItem, getReaderView, importReadLater, resetCaptureToken, saveReadItemToNotes, setReadStatus } from "@/app/actions";
import { relativeTime } from "@/lib/dates";
import { SOURCE_LABEL, hostOf, type ReadSource } from "@/lib/read-later";
import type { ReadItemDTO, ReaderView } from "@/lib/read-later-data";
import { useReport } from "./TaskSheet";

type Tab = "unread" | "read" | "all";

const SOURCE_DOT: Record<string, string> = { web: "var(--c1)", instagram: "#d6336c", x: "var(--ink)", youtube: "#e03131", text: "var(--c3)" };

export function ReadLater({ items: initial, token: initialToken, appUrl }: { items: ReadItemDTO[]; token: string; appUrl: string }) {
  const report = useReport();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<Tab>("unread");
  const [source, setSource] = useState<string>("all");
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  /** item id → note id, for "In Notes" after saving (kept apart from the server's list, which refreshes). */
  const [inNotes, setInNotes] = useState<Record<string, string>>({});
  const [setup, setSetup] = useState(!initialToken);
  const [saving, startSave] = useTransition();
  const [, start] = useTransition();
  useEffect(() => setItems(initial), [initial]);

  // "Read Later" bookmark in Chrome (computer): /read-later?add=<page> saves that page, then cleans the address.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const add = p.get("add");
    if (!add) return;
    router.replace("/read-later", { scroll: false });
    startSave(async () => void report(await addReadLater([p.get("title"), add].filter(Boolean).join(" "))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => ({ unread: items.filter((i) => i.status === "unread").length, read: items.filter((i) => i.status === "read").length, all: items.length }), [items]);
  const sources = useMemo(() => [...new Set(items.map((i) => i.source))], [items]);
  const shown = items.filter((i) => (tab === "all" || i.status === tab) && (source === "all" || i.source === source));
  const open = preview ? items.find((i) => i.id === preview) ?? null : null;

  const toggleRead = (it: ReadItemDTO, read: boolean) => {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, status: read ? "read" : "unread" } : x)));
    start(async () => void report(await setReadStatus(it.id, read)));
  };
  const remove = (it: ReadItemDTO) => {
    const before = items;
    setItems((l) => l.filter((x) => x.id !== it.id));
    if (preview === it.id) setPreview(null);
    start(async () => {
      if (!report(await deleteReadItem(it.id))) setItems(before);
    });
  };
  const toNotes = (it: ReadItemDTO) =>
    start(async () => {
      const r = await saveReadItemToNotes(it.id);
      if (report(r) && r.noteId) setInNotes((m) => ({ ...m, [it.id]: r.noteId! }));
    });

  // Esc closes the preview.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <div>
      {/* toolbar: add, filters, setup */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-[260px] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            startSave(async () => {
              if (report(await addReadLater(draft))) setDraft("");
            });
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a link or a note…" aria-label="Save to read later" className="input flex-1 !text-[14.5px]" />
          <button className="btn btn-primary shrink-0" disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
        <div className="seg-sm" role="group" aria-label="Show">
          {(["unread", "read", "all"] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === "unread" ? "To read" : t === "read" ? "Read" : "All"} <span className="num text-ink-3">{counts[t]}</span>
            </button>
          ))}
        </div>
        <button className={`btn ${setup ? "btn-secondary" : "btn-ghost"} !text-[13px]`} onClick={() => setSetup((v) => !v)} aria-expanded={setup}>
          <Settings2 size={14} /> Phone & import
        </button>
      </div>
      {sources.length > 1 && (
        <div className="-mt-2 mb-4 flex flex-wrap gap-1.5">
          <button className="chip" aria-pressed={source === "all"} onClick={() => setSource("all")}>
            Everything
          </button>
          {sources.map((s) => (
            <button key={s} className="chip inline-flex items-center gap-1.5" aria-pressed={source === s} onClick={() => setSource(s)}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[s] ?? "var(--ink-3)" }} />
              {SOURCE_LABEL[s as ReadSource] ?? s}
            </button>
          ))}
        </div>
      )}
      {setup && (
        <div className="mb-5 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          <PhoneSetup token={initialToken} appUrl={appUrl} />
          <Bookmarklet appUrl={appUrl} />
          <ImportBox />
        </div>
      )}

      <div className={open ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-5" : ""}>
        {/* the boards — Keep-style blocks that pack into columns */}
        <div className={open ? "hidden lg:block" : ""}>
          <div className={`gap-4 ${open ? "columns-1 xl:columns-2" : "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5"}`}>
            {shown.map((it) => (
              <ReadCard key={it.id} it={{ ...it, savedToNotes: inNotes[it.id] }} active={preview === it.id} onOpen={() => setPreview(it.id)} onRead={(r) => toggleRead(it, r)} onDelete={() => remove(it)} onNotes={() => toNotes(it)} />
            ))}
          </div>
          {!shown.length && (
            <p className="card py-12 text-center text-[14px] text-ink-2">{tab === "unread" ? "Nothing waiting — share a link from your phone or paste one above." : "Nothing here yet."}</p>
          )}
        </div>
        {open && <ReaderPanel key={open.id} it={{ ...open, savedToNotes: inNotes[open.id] }} onClose={() => setPreview(null)} onRead={(r) => toggleRead(open, r)} onNotes={() => toNotes(open)} />}
      </div>
    </div>
  );
}

type Item = ReadItemDTO & { savedToNotes?: string };

/** One saved item as a Keep-style block: image on top (when the page has one), title, summary, site. */
function ReadCard({ it, active, onOpen, onRead, onDelete, onNotes }: { it: Item; active: boolean; onOpen: () => void; onRead: (read: boolean) => void; onDelete: () => void; onNotes: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const read = it.status === "read";
  const host = it.url ? hostOf(it.url) : null;
  return (
    <article
      className={`group relative mb-4 break-inside-avoid overflow-hidden rounded-[14px] border bg-[var(--card-bg-strong)] transition-shadow hover:shadow-[var(--shadow-lift)] ${active ? "border-accent ring-2 ring-[var(--accent-soft)]" : "border-hairline"} ${read ? "opacity-75" : ""}`}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Preview ${it.title}`}>
        {it.imageUrl && imgOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="max-h-[260px] w-full border-b border-hairline bg-surface-2 object-cover" />
        )}
        <div className="px-3.5 pb-2 pt-3">
          <div className={`text-[14.5px] font-semibold leading-snug ${read ? "text-ink-2" : ""}`}>{it.title}</div>
          {it.description && <p className={`mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2 ${it.source === "text" ? "line-clamp-[12]" : "line-clamp-4"}`}>{it.description}</p>}
          <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            {host ? <Favicon host={host} small /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT.text }} />}
            <span className="truncate">{it.siteName ?? host ?? "Note"}</span>
            <span className="shrink-0">· {relativeTime(new Date(it.savedAt))}</span>
            {it.via === "phone" && <Smartphone size={10} className="shrink-0" aria-label="from phone" />}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-0.5 px-2 pb-2 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        <button className="btn btn-ghost !px-2" onClick={onOpen} aria-label="Preview" title="Preview">
          <BookOpenText size={15} />
        </button>
        {it.url && (
          <a href={it.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost !px-2" aria-label="Open original" title="Open original">
            <ExternalLink size={15} />
          </a>
        )}
        {it.savedToNotes ? (
          <Link href={`/notes?n=${it.savedToNotes}`} className="btn btn-ghost !px-2 text-good" aria-label="Open in Notes" title="Saved — open in Notes">
            <NotebookPen size={15} />
          </Link>
        ) : (
          <button className="btn btn-ghost !px-2" onClick={onNotes} aria-label="Save to notes" title="Save to notes">
            <NotebookPen size={15} />
          </button>
        )}
        <button className={`btn btn-ghost !px-2 ${read ? "" : "text-good"}`} onClick={() => onRead(!read)} aria-label={read ? "Mark as unread" : "Mark as read"} title={read ? "Mark as unread" : "Mark as read"}>
          {read ? <Undo2 size={15} /> : <Check size={16} />}
        </button>
        <span className="ml-auto">
          {confirm ? (
            <button className="btn btn-danger !px-2 !py-1 !text-[12px]" onClick={onDelete} onBlur={() => setConfirm(false)}>
              Delete
            </button>
          ) : (
            <button className="btn btn-ghost !px-2 text-ink-3" onClick={() => setConfirm(true)} aria-label="Delete" title="Delete">
              <Trash2 size={15} />
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

/** Print View: the article's images and text only, on the right (full screen on phones). */
function ReaderPanel({ it, onClose, onRead, onNotes }: { it: Item; onClose: () => void; onRead: (read: boolean) => void; onNotes: () => void }) {
  const [view, setView] = useState<ReaderView | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getReaderView(it.id)
      .then((v) => alive && setView(v))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [it.id]);
  const read = it.status === "read";
  const host = it.url ? hostOf(it.url) : null;
  const image = view?.imageUrl ?? it.imageUrl;
  const showHero = image && !(view?.content ?? "").includes(image);
  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-surface lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:h-[calc(100vh-3rem)] lg:rounded-[16px] lg:border lg:border-hairline" aria-label="Preview">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-hairline bg-[var(--card-bg-strong)] px-3 py-2 backdrop-blur-xl">
        <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close preview" title="Close (Esc)">
          <X size={16} />
        </button>
        <span className="label-mono ml-1 truncate">Print view{host ? ` · ${host}` : ""}</span>
        <div className="ml-auto flex items-center gap-1">
          {it.savedToNotes ? (
            <Link href={`/notes?n=${it.savedToNotes}`} className="btn btn-secondary !py-1 !text-[12.5px]">
              <NotebookPen size={14} /> In Notes
            </Link>
          ) : (
            <button className="btn btn-secondary !py-1 !text-[12.5px]" onClick={onNotes}>
              <NotebookPen size={14} /> Save to notes
            </button>
          )}
          <button className="btn btn-ghost !px-2" onClick={() => onRead(!read)} aria-label={read ? "Mark as unread" : "Mark as read"} title={read ? "Mark as unread" : "Mark as read"}>
            {read ? <Undo2 size={15} /> : <Check size={16} className="text-good" />}
          </button>
          {it.url && (
            <a href={it.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost !px-2" aria-label="Open original" title="Open original">
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>
      <article className="mx-auto max-w-[720px] px-5 pb-16 pt-6 sm:px-8">
        <h1 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] sm:text-[32px]">{view?.title ?? it.title}</h1>
        <p className="mt-2 text-[13px] text-ink-3">
          {[view?.byline, view?.siteName ?? it.siteName ?? host, view?.readMinutes ? `${view.readMinutes} min read` : null].filter(Boolean).join(" · ")}
        </p>
        {showHero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image!} alt="" referrerPolicy="no-referrer" className="mt-5 w-full rounded-[12px] border border-hairline" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        <div className="mt-6">
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[92, 100, 84, 96, 70].map((w, i) => (
                <div key={i} className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : view?.content ? (
            // Sanitized on the server (lib/reader.ts: allow-listed tags, http(s) links and images only).
            <div className="reader" dangerouslySetInnerHTML={{ __html: view.content }} />
          ) : (
            <div className="reader">
              {(view?.description ?? it.description) && <p className="whitespace-pre-line">{view?.description ?? it.description}</p>}
              {it.url && (
                <p className="rounded-[12px] bg-surface-2 p-4 text-[14px] text-ink-2">
                  This page can't be shown in print view — it may need a login (Instagram, X) or be mostly video.{" "}
                  <a href={it.url} target="_blank" rel="noreferrer noopener">
                    Open the original
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

/** Site icon, or the site's first letter if it can't load. */
function Favicon({ host, small }: { host: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`inline-flex shrink-0 items-center justify-center rounded bg-surface-2 uppercase ${small ? "h-3.5 w-3.5 text-[9px]" : "h-6 w-6"}`}>{host.charAt(0)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className={`shrink-0 rounded ${small ? "h-3.5 w-3.5" : "h-6 w-6"}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

/** The phone side: the capture key and how to make the iPhone Shortcut. */
function PhoneSetup({ token: initial, appUrl }: { token: string; appUrl: string }) {
  const report = useReport();
  const [token, setToken] = useState(initial);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const endpoint = `${appUrl.replace(/\/+$/, "")}/api/capture`;
  const copy = async (what: string, label: string) => {
    await navigator.clipboard.writeText(what);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <section className="card animate-in">
      <div className="mb-2 flex items-center gap-2">
        <Smartphone size={15} className="text-ink-3" />
        <h2 className="label-mono">Save from your phone</h2>
      </div>
      {!token ? (
        <>
          <p className="text-[13px] text-ink-2">Make a private key, then add a Shortcut to your iPhone's share sheet. Anything you share to it lands here.</p>
          <button
            className="btn btn-primary mt-3 w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resetCaptureToken();
                if (report(r) && r.token) (setToken(r.token), setShow(true));
              })
            }
          >
            <KeyRound size={14} /> Create my capture key
          </button>
        </>
      ) : (
        <>
          <div className="space-y-2 text-[12.5px]">
            <div>
              <div className="text-ink-3">Address</div>
              <button className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-left font-mono text-[11.5px]" onClick={() => copy(endpoint, "url")}>
                <span className="truncate">{endpoint}</span>
                {copied === "url" ? <Check size={13} className="shrink-0 text-good" /> : <Copy size={13} className="shrink-0 text-ink-3" />}
              </button>
            </div>
            <div>
              <div className="flex items-center justify-between text-ink-3">
                Key
                <button className="text-[11.5px] hover:text-ink" onClick={() => setShow((v) => !v)}>
                  {show ? "Hide" : "Show"}
                </button>
              </div>
              <button className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-[8px] bg-surface-2 px-2.5 py-1.5 text-left font-mono text-[11.5px]" onClick={() => copy(token, "key")}>
                <span className="truncate">{show ? token : "•".repeat(24)}</span>
                {copied === "key" ? <Check size={13} className="shrink-0 text-good" /> : <Copy size={13} className="shrink-0 text-ink-3" />}
              </button>
            </div>
          </div>
          <details className="mt-3 text-[12.5px] text-ink-2">
            <summary className="cursor-pointer font-medium text-ink">Make the iPhone Shortcut (2 min)</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>
                Open <b>Shortcuts</b> → <b>+</b>. Name it <b>Read Later</b>.
              </li>
              <li>
                Tap <b>ⓘ</b> → turn on <b>Show in Share Sheet</b> (accept URLs and Text — works from Chrome, Safari and any app).
              </li>
              <li>
                Add <b>Get Contents of URL</b>: URL = the address above · Method <b>POST</b> · Headers: <code>Authorization</code> = <code>Bearer </code>+ your key · Request Body <b>JSON</b> with <code>text</code> = <i>Shortcut Input</i>.
              </li>
              <li>
                Optional: add <b>Show Notification</b> “Saved ✓”. Also add it to the Home Screen, Back Tap or the Action button with <b>Ask for Text</b> as the input.
              </li>
              <li>Share any link or text → <b>Read Later</b>. It shows up here in a few seconds.</li>
            </ol>
          </details>
          <button
            className="mt-3 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resetCaptureToken();
                if (report(r) && r.token) (setToken(r.token), setShow(true));
              })
            }
          >
            <RotateCcw size={12} /> New key (the old one stops working)
          </button>
        </>
      )}
    </section>
  );
}

/** A bookmark for Chrome on the computer: one click saves the page you're on. */
function Bookmarklet({ appUrl }: { appUrl: string }) {
  const code = `javascript:(()=>{window.open('${appUrl.replace(/\/+$/, "")}/read-later?add='+encodeURIComponent(location.href),'_blank')})()`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="card animate-in">
      <div className="mb-2 flex items-center gap-2">
        <BookmarkPlus size={15} className="text-ink-3" />
        <h2 className="label-mono">Chrome on the computer</h2>
      </div>
      <p className="text-[12.5px] text-ink-2">
        Show the bookmarks bar (<b>⌘⇧B</b> / <b>Ctrl+Shift+B</b>) and drag this button onto it. On any page, click it to save that page here.
      </p>
      <div className="mt-3 flex items-center gap-2">
        {/* React blocks javascript: links in JSX, so the href is set on the element directly. */}
        <a
          ref={(el) => el?.setAttribute("href", code)}
          onClick={(e) => e.preventDefault()}
          className="btn btn-primary cursor-grab"
          title="Drag me to the bookmarks bar"
        >
          <BookmarkPlus size={14} /> Read Later
        </a>
        <button
          className="btn btn-ghost !text-[12.5px]"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} className="text-good" /> : <Copy size={13} />} Copy as URL
        </button>
      </div>
    </section>
  );
}

/** Bring in what's already saved elsewhere (export files). */
function ImportBox() {
  const report = useReport();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card animate-in">
      <div className="mb-2 flex items-center gap-2">
        <FileUp size={15} className="text-ink-3" />
        <h2 className="label-mono">Import saved links</h2>
      </div>
      <ul className="space-y-1.5 text-[12.5px] text-ink-2">
        <li>
          <b className="text-ink">Instagram</b> — Accounts Center → Your information → Download your information → only <i>Saved</i>, JSON. Upload <code>saved_posts.json</code>.
        </li>
        <li>
          <b className="text-ink">Chrome Reading list</b> — takeout.google.com → Chrome → <i>ReadingList</i>. Or Chrome bookmarks exported as <code>.html</code>.
        </li>
        <li>
          <b className="text-ink">X bookmarks</b> — X doesn't include bookmarks in its archive; share posts to the Shortcut instead.
        </li>
        <li>Any other .json, .html or .txt with links works too. Already-saved links are skipped.</li>
      </ul>
      <input
        ref={input}
        type="file"
        accept=".json,.html,.htm,.txt,.csv,application/json,text/html,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          start(async () => {
            report(await importReadLater(fd));
          });
          e.target.value = "";
        }}
      />
      <button className="btn btn-secondary mt-3 w-full" disabled={pending} onClick={() => input.current?.click()}>
        <FileUp size={14} /> {pending ? "Importing…" : "Choose a file"}
      </button>
    </section>
  );
}
