"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Check, Copy, Heart, Landmark, Shuffle } from "lucide-react";
import { setQuoteSaved } from "@/app/actions";
import { STOIC_QUOTES, VERSES } from "@/lib/daily-content";
import { another, type QuoteKind } from "@/lib/daily";
import { useReport } from "./TaskSheet";

/** Today's stoic thought and Bible verse, side by side. Heart saves one to Saved; shuffle shows another. */
export function DailyInspiration({ stoicIndex, verseIndex, saved }: { stoicIndex: number; verseIndex: number; saved: string[] }) {
  const [savedKeys, setSavedKeys] = useState(() => new Set(saved));
  const toggle = (k: string, on: boolean) =>
    setSavedKeys((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <QuoteCard kind="stoic" initial={stoicIndex} savedKeys={savedKeys} onToggle={toggle} />
      <QuoteCard kind="verse" initial={verseIndex} savedKeys={savedKeys} onToggle={toggle} />
    </div>
  );
}

function QuoteCard({ kind, initial, savedKeys, onToggle }: { kind: QuoteKind; initial: number; savedKeys: Set<string>; onToggle: (k: string, on: boolean) => void }) {
  const report = useReport();
  const [index, setIndex] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const list = kind === "stoic" ? STOIC_QUOTES : VERSES;
  const item = list[index];
  const key = `${kind}:${item.id}`;
  const isSaved = savedKeys.has(key);
  const text = item.text;
  const by = kind === "stoic" ? (item as (typeof STOIC_QUOTES)[number]).author : (item as (typeof VERSES)[number]).ref;
  const detail = kind === "stoic" ? (item as (typeof STOIC_QUOTES)[number]).source : `${(item as (typeof VERSES)[number]).theme} · KJV`;

  const save = () => {
    const next = !isSaved;
    onToggle(key, next);
    start(async () => {
      if (!report(await setQuoteSaved(kind, item.id, next))) onToggle(key, !next);
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`“${text}” — ${by}${kind === "verse" ? " (KJV)" : ""}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="card animate-in flex flex-col">
      <div className="card-head flex items-center justify-between gap-3">
        <h2 className="label-mono inline-flex items-center gap-1.5">
          {kind === "stoic" ? <Landmark size={12} aria-hidden /> : <BookOpen size={12} aria-hidden />}
          {kind === "stoic" ? "Stoic thought" : "Verse of the day"}
          {index !== initial && <span className="font-normal normal-case tracking-normal text-ink-3">· another</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          <Link href="/saved" className="mr-1 text-[12px] text-accent">
            Saved
          </Link>
          <button className="icon-btn !h-7 !w-7" aria-label="Show another" title="Show another" onClick={() => setIndex(another(index, list.length))}>
            <Shuffle size={13} />
          </button>
          <button className="icon-btn !h-7 !w-7" aria-label="Copy" title="Copy" onClick={copy}>
            {copied ? <Check size={13} className="text-good" /> : <Copy size={13} />}
          </button>
          <button
            className={`icon-btn !h-7 !w-7 ${isSaved ? "!text-bad" : ""}`}
            aria-label={isSaved ? "Remove from saved" : "Save"}
            aria-pressed={isSaved}
            title={isSaved ? "Saved — click to remove" : "Save"}
            onClick={save}
          >
            <Heart size={13} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      <blockquote className="flex flex-1 flex-col justify-center">
        <p className={`display leading-[1.22] ${text.length > 180 ? "text-[20px] md:text-[22px]" : text.length > 110 ? "text-[23px] md:text-[25px]" : "text-[26px] md:text-[30px]"}`}>
          “{text}”
        </p>
        <footer className="mt-3 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{by}</span> · {detail}
        </footer>
      </blockquote>
    </section>
  );
}
