"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, HardDrive, Link2, Loader2, Paperclip, Search, Upload, X } from "lucide-react";
import {
  attachDriveFile,
  attachLink,
  attachNote,
  findNotes,
  finishUpload,
  removeAttachment,
  searchDriveFiles,
  startUpload,
  taskAttachments,
  uploadAttachment,
  type ActionResult,
  type AttachmentDTO,
} from "@/app/actions";
import { DIRECT_UPLOAD_OVER, fileKind, isHttpUrl } from "@/lib/drive";
import type { NoteDTO } from "@/lib/notes-data";
import { useReport } from "./TaskSheet";

type Panel = "note" | "drive" | null;
type DriveHit = { id: string; name: string; mimeType: string; modifiedTime: string | null };

/**
 * "Attachments" in the task editor: notes from here, Google Drive files (search or paste a link), any link, and
 * uploads — those go to Google Drive in "Lud Worklife/<project>". Removing one only removes the reference.
 */
export function TaskAttachments({ taskId }: { taskId: string }) {
  const report = useReport();
  const [items, setItems] = useState<AttachmentDTO[] | null>(null);
  const [drive, setDrive] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const load = () =>
    taskAttachments(taskId)
      .then((r) => (setItems(r.items), setDrive(r.drive)))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const run = (fn: () => Promise<ActionResult>, close = true) =>
    start(async () => {
      if (report(await fn())) {
        if (close) setPanel(null);
        await load();
      }
    });

  const send = async (f: File) => {
    setUpload({ name: f.name, pct: 0 });
    try {
      if (f.size <= DIRECT_UPLOAD_OVER) {
        const form = new FormData();
        form.set("taskId", taskId);
        form.set("file", f);
        setUpload({ name: f.name, pct: 50 });
        if (report(await uploadAttachment(form))) await load();
        return;
      }
      // Big files go from the browser straight to Google Drive.
      const s = await startUpload(taskId, f.name, f.type, f.size);
      if (!s.ok) return void report({ ok: false, error: s.error });
      const fileId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", s.url);
        xhr.upload.onprogress = (e) => e.lengthComputable && setUpload({ name: f.name, pct: Math.round((e.loaded / e.total) * 100) });
        xhr.onload = () => {
          try {
            if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).id);
            else reject(new Error(`Google Drive answered ${xhr.status}`));
          } catch (e) {
            reject(e);
          }
        };
        xhr.onerror = () => reject(new Error("The upload was interrupted"));
        xhr.send(f);
      });
      if (report(await finishUpload(taskId, fileId))) await load();
    } catch (e) {
      report({ ok: false, error: `Couldn't upload: ${(e as Error).message}` });
    } finally {
      setUpload(null);
    }
  };

  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-2">
        <Paperclip size={14} /> Attachments
        {items && items.length > 0 && <span className="num text-[12px] font-normal text-ink-3">{items.length}</span>}
        <span className="ml-auto flex gap-1">
          <ChipButton active={panel === "note"} onClick={() => setPanel(panel === "note" ? null : "note")}>
            <FileText size={13} /> Note
          </ChipButton>
          <ChipButton active={panel === "drive"} onClick={() => setPanel(panel === "drive" ? null : "drive")}>
            <HardDrive size={13} /> Drive / link
          </ChipButton>
          <ChipButton onClick={() => file.current?.click()} disabled={Boolean(upload)}>
            <Upload size={13} /> Upload
          </ChipButton>
        </span>
        <input
          ref={file}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!drive) return void report({ ok: false, error: "Uploads go to Google Drive — allow Google Drive on Connections first." });
            void send(f);
          }}
        />
      </div>

      {panel === "note" && <NotePicker onPick={(id) => run(() => attachNote(taskId, id))} />}
      {panel === "drive" && <DrivePicker drive={drive} onPick={(id) => run(() => attachDriveFile(taskId, id))} onLink={(url) => run(() => attachLink(taskId, url))} />}

      {upload && (
        <div className="mb-2 rounded-[9px] bg-surface px-3 py-2 text-[12.5px]">
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-ink-3" />
            <span className="min-w-0 flex-1 truncate">Uploading {upload.name} to Google Drive…</span>
            <span className="num text-ink-3">{upload.pct}%</span>
          </div>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(4, upload.pct)}%` }} />
          </div>
        </div>
      )}

      {items === null ? (
        <p className="py-1 text-[12.5px] text-ink-3">Loading…</p>
      ) : items.length ? (
        <ul className="space-y-1">
          {items.map((a) => (
            <AttachmentRow key={a.id} a={a} onRemove={() => run(() => removeAttachment(a.id), false)} />
          ))}
        </ul>
      ) : (
        !panel && <p className="text-[12.5px] text-ink-3">Link a note, a Google Drive file or any link — or upload a file (it’s saved in your Drive, in this project’s folder).</p>
      )}
    </div>
  );
}

function ChipButton({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[12px] font-medium transition-colors disabled:opacity-50 ${
        active ? "border-ink bg-ink text-surface" : "border-hairline bg-surface text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function AttachmentRow({ a, onRemove }: { a: AttachmentDTO; onRemove: () => void }) {
  const icon = a.kind === "note" ? <FileText size={14} /> : a.kind === "drive" ? <HardDrive size={14} /> : <Link2 size={14} />;
  const label = a.kind === "note" ? "Note" : a.kind === "drive" ? `${fileKind(a.mimeType, a.title)}${a.uploaded ? " · uploaded" : ""}` : "Link";
  const inner = (
    <>
      <span className="text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{a.title}</span>
      <span className="shrink-0 text-[11.5px] text-ink-3">{label}</span>
    </>
  );
  return (
    <li className="group flex items-center gap-1 rounded-[9px] bg-surface pr-1 text-[13px]">
      {a.url ? (
        a.kind === "note" ? (
          <Link href={a.url} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 hover:text-accent">
            {inner}
          </Link>
        ) : (
          <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 hover:text-accent">
            {inner}
          </a>
        )
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5">{inner}</span>
      )}
      <button type="button" onClick={onRemove} className="rounded p-1 text-ink-3 hover:text-bad" aria-label={`Remove ${a.title}`} title="Remove from the task">
        <X size={13} />
      </button>
    </li>
  );
}

/** Search the notes here and pick one. */
function NotePicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NoteDTO[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => findNotes(q).then(setHits).catch(() => setHits([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="mb-2 rounded-[10px] border border-hairline bg-surface p-2">
      <SearchBox value={q} onChange={setQ} placeholder="Search your notes or #tag" />
      <ul className="mt-1 max-h-[220px] overflow-y-auto">
        {hits?.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onPick(n.id)} className="flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2">
              <FileText size={14} className="mt-[2px] shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{n.displayTitle}</span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {n.folderName ?? "Inbox"}
                  {n.excerpt ? ` · ${n.excerpt}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
        {hits && !hits.length && <li className="px-2 py-2 text-[12.5px] text-ink-3">No notes match.</li>}
      </ul>
    </div>
  );
}

/** Search Google Drive (when connected) — or paste any link (Drive/Docs links become files, others stay links). */
function DrivePicker({ drive, onPick, onLink }: { drive: boolean; onPick: (id: string) => void; onLink: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DriveHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLink = isHttpUrl(q);
  useEffect(() => {
    if (!drive || isLink) return;
    const t = setTimeout(
      () =>
        searchDriveFiles(q).then((r) => {
          if (r.ok) (setHits(r.files), setError(null));
          else (setHits([]), setError(r.error));
        }),
      300,
    );
    return () => clearTimeout(t);
  }, [q, drive, isLink]);
  return (
    <div className="mb-2 rounded-[10px] border border-hairline bg-surface p-2">
      <SearchBox value={q} onChange={setQ} onEnter={() => isLink && onLink(q.trim())} placeholder={drive ? "Search Google Drive or paste a link" : "Paste a link (Drive, Docs or any site)"} />
      {isLink ? (
        <button type="button" onClick={() => onLink(q.trim())} className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
          <Link2 size={14} className="text-ink-3" /> Add this link
        </button>
      ) : !drive ? (
        <p className="px-1 pt-2 text-[12px] text-ink-3">
          To search your Drive and upload files, allow Google Drive on{" "}
          <Link href="/connections" className="text-accent">
            Connections
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-1 max-h-[220px] overflow-y-auto">
          {hits?.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onPick(f.id)} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left hover:bg-surface-2">
                <HardDrive size={14} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
                <span className="shrink-0 text-[11.5px] text-ink-3">{fileKind(f.mimeType, f.name)}</span>
              </button>
            </li>
          ))}
          {hits === null && <li className="px-2 py-2 text-[12.5px] text-ink-3">Searching…</li>}
          {hits && !hits.length && <li className="px-2 py-2 text-[12.5px] text-ink-3">{error ?? "No files match."}</li>}
        </ul>
      )}
    </div>
  );
}

/** No <form> here: the picker sits inside the task editor's form, and Enter must not save (and close) the task. */
function SearchBox({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void }) {
  return (
    <label className="relative block">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onEnter?.();
        }}
        placeholder={placeholder} className="input !rounded-[8px] !py-1.5 !pl-7 !text-[13px]" aria-label={placeholder} />
    </label>
  );
}
