"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BookmarkPlus, Check, Copy, ExternalLink, FileUp, KeyRound, RotateCcw, Smartphone, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { addReadLater, deleteReadItem, importReadLater, resetCaptureToken, setReadStatus } from "@/app/actions";
import { relativeTime } from "@/lib/dates";
import { SOURCE_LABEL, hostOf, type ReadSource } from "@/lib/read-later";
import type { ReadItemDTO } from "@/lib/read-later-data";
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

  const toggleRead = (it: ReadItemDTO, read: boolean) => {
    setItems((l) => l.map((x) => (x.id === it.id ? { ...x, status: read ? "read" : "unread" } : x)));
    start(async () => void report(await setReadStatus(it.id, read)));
  };
  const remove = (it: ReadItemDTO) => {
    const before = items;
    setItems((l) => l.filter((x) => x.id !== it.id));
    start(async () => {
      if (!report(await deleteReadItem(it.id))) setItems(before);
    });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <form
          className="card animate-in flex items-start gap-2 !p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            startSave(async () => {
              const r = await addReadLater(draft);
              if (report(r)) setDraft("");
            });
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder="Paste a link or a note…"
            aria-label="Save to read later"
            className="input min-h-[42px] flex-1 resize-none !text-[14.5px] sm:resize-y"
          />
          <button className="btn btn-primary shrink-0" disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg-sm" role="group" aria-label="Show">
            {(["unread", "read", "all"] as const).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === "unread" ? "To read" : t === "read" ? "Read" : "All"} <span className="num text-ink-3">{counts[t]}</span>
              </button>
            ))}
          </div>
          {sources.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
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
        </div>

        <ul className="card animate-in !p-0">
          {shown.map((it) => (
            <ReadRow key={it.id} it={it} onRead={(r) => toggleRead(it, r)} onDelete={() => remove(it)} />
          ))}
          {!shown.length && (
            <li className="px-5 py-12 text-center text-[14px] text-ink-2">
              {tab === "unread" ? "Nothing waiting — share a link from your phone or paste one above." : "Nothing here yet."}
            </li>
          )}
        </ul>
      </div>

      <aside className="space-y-4">
        <PhoneSetup token={initialToken} appUrl={appUrl} />
        <Bookmarklet appUrl={appUrl} />
        <ImportBox />
      </aside>
    </div>
  );
}

function ReadRow({ it, onRead, onDelete }: { it: ReadItemDTO; onRead: (read: boolean) => void; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const read = it.status === "read";
  const host = it.url ? hostOf(it.url) : null;
  const body = (
    <>
      <div className={`line-clamp-2 text-[14.5px] font-medium leading-snug ${read ? "text-ink-2" : ""}`}>{it.title}</div>
      {it.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{it.description}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[it.source] ?? "var(--ink-3)" }} />
          {it.siteName ?? host ?? SOURCE_LABEL[it.source as ReadSource] ?? "Note"}
        </span>
        <span>· saved {relativeTime(new Date(it.savedAt))}</span>
        {it.via === "phone" && (
          <span className="inline-flex items-center gap-0.5">
            · <Smartphone size={10} /> phone
          </span>
        )}
        {it.via === "import" && <span>· imported</span>}
      </div>
    </>
  );
  return (
    <li className={`group flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-b-0 ${read ? "opacity-70" : ""}`}>
      {it.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={it.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="mt-0.5 h-14 w-14 shrink-0 rounded-[10px] border border-hairline bg-surface-2 object-cover sm:h-16 sm:w-24"
        />
      ) : (
        <span className="mt-0.5 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-[18px] font-semibold text-ink-3 sm:h-16 sm:w-24">
          {host ? <Favicon host={host} /> : "Aa"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {it.url ? (
          <a href={it.url} target="_blank" rel="noreferrer noopener" className="block hover:underline-offset-2 [&>div:first-child]:hover:underline">
            {body}
          </a>
        ) : (
          <div className="whitespace-pre-wrap">{body}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {it.url && (
          <a href={it.url} target="_blank" rel="noreferrer noopener" className="btn btn-ghost !px-2" aria-label="Open" title="Open">
            <ExternalLink size={15} />
          </a>
        )}
        <button className={`btn btn-ghost !px-2 ${read ? "" : "text-good"}`} onClick={() => onRead(!read)} aria-label={read ? "Mark as unread" : "Mark as read"} title={read ? "Mark as unread" : "Mark as read"}>
          {read ? <Undo2 size={15} /> : <Check size={16} />}
        </button>
        {confirm ? (
          <button className="btn btn-danger !px-2 !py-1 !text-[12px]" onClick={onDelete} onBlur={() => setConfirm(false)}>
            Delete
          </button>
        ) : (
          <button className="btn btn-ghost !px-2 text-ink-3" onClick={() => setConfirm(true)} aria-label="Delete" title="Delete">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Site icon, or the site's first letter if it can't load. */
function Favicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="uppercase">{host.charAt(0)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className="h-6 w-6 rounded" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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
