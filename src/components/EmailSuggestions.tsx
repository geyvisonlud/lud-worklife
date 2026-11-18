"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, Flag, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import { acceptEmailSuggestion, dismissEmailSuggestion, scanEmailIfStale, scanEmailNow } from "@/app/actions";
import { relativeDay, relativeTime } from "@/lib/dates";
import { PRIORITY_COLOR } from "./TaskBits";
import { useReport, useWork } from "./TaskSheet";

export type SuggestionDTO = {
  id: string;
  title: string;
  reason: string | null;
  dueDate: string | null;
  priority: number;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  link: string;
  account: string;
  source: string;
};

/** "Possible tasks": things your inbox seems to be asking of you. Add one as a task, or dismiss it. */
export function EmailSuggestions({ items, canScan, lastScan, multipleAccounts }: { items: SuggestionDTO[]; canScan: boolean; lastScan: string | null; multipleAccounts: boolean }) {
  const report = useReport();
  const [list, setList] = useState(items);
  const [scanning, startScan] = useTransition();
  useEffect(() => setList(items), [items]);
  useEffect(() => {
    if (canScan) scanEmailIfStale().catch(() => {});
  }, [canScan]);

  const act = (id: string, accept: boolean) => {
    const before = list;
    setList((l) => l.filter((x) => x.id !== id));
    void (async () => {
      if (!report(await (accept ? acceptEmailSuggestion(id) : dismissEmailSuggestion(id)))) setList(before);
    })();
  };

  return (
    <section className="card animate-in">
      <div className="card-head flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="label-mono inline-flex items-center gap-1.5">
          <Sparkles size={12} aria-hidden /> Possible tasks from email
          {list.length > 0 && <span className="num rounded-full bg-accent px-1.5 text-[10px] font-semibold tracking-normal text-white">{list.length}</span>}
        </h2>
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          {lastScan && <span className="hidden sm:inline">Checked {relativeTime(new Date(lastScan))}</span>}
          {canScan && (
            <button className="icon-btn !h-7 !w-7" aria-label="Check email now" disabled={scanning} onClick={() => startScan(async () => void report(await scanEmailNow()))}>
              <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      {!canScan && !list.length ? (
        <div className="py-4 text-center text-[14px] text-ink-2">
          <Mail size={20} className="mx-auto mb-2 text-ink-3" />
          Connect a Google account with Gmail access and the emails that ask something of you show up here — newsletters and marketing are ignored.
          <div className="mt-3">
            <Link href="/connections" className="btn btn-secondary">
              Connect Gmail
            </Link>
          </div>
        </div>
      ) : list.length === 0 ? (
        <p className="py-5 text-center text-[14px] text-ink-2">Nothing in your inbox needs you right now.</p>
      ) : (
        <ul>
          {list.map((s) => (
            <Row key={s.id} s={s} multipleAccounts={multipleAccounts} onAccept={() => act(s.id, true)} onDismiss={() => act(s.id, false)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ s, multipleAccounts, onAccept, onDismiss }: { s: SuggestionDTO; multipleAccounts: boolean; onAccept: () => void; onDismiss: () => void }) {
  const { today } = useWork();
  const who = s.fromName ?? s.fromEmail;
  return (
    <li className="list-row flex items-start gap-3 py-2.5">
      <span className="mt-[3px] h-[18px] w-[3px] shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[s.priority] ?? PRIORITY_COLOR[0] }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-medium leading-snug">{s.title}</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-2">
          <a href={s.link} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:text-ink" title={`${who} — ${s.subject}`}>
            <Mail size={11} className="shrink-0" />
            <span className="truncate">
              {who} · {s.subject}
            </span>
            <ExternalLink size={10} className="shrink-0 text-ink-3" />
          </a>
          {s.dueDate && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Flag size={10} /> {relativeDay(s.dueDate, today)}
            </span>
          )}
          <span className="whitespace-nowrap text-ink-3">{relativeTime(new Date(s.receivedAt))}</span>
          {multipleAccounts && <span className="truncate text-ink-3">{s.account}</span>}
        </div>
        {s.reason && <div className="mt-0.5 text-[12px] text-ink-3">{s.reason}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className="btn btn-secondary !px-2.5 !py-1 !text-[12.5px]" onClick={onAccept} aria-label={`Add “${s.title}” to tasks`}>
          <Check size={13} /> <span className="hidden sm:inline">Add task</span>
        </button>
        <button className="icon-btn !h-7 !w-7" onClick={onDismiss} aria-label={`Dismiss “${s.title}”`}>
          <X size={13} />
        </button>
      </div>
    </li>
  );
}
