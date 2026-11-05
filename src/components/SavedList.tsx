"use client";

import { useState, useTransition } from "react";
import { BookOpen, Check, Copy, Landmark, Trash2 } from "lucide-react";
import { deleteSavedQuote } from "@/app/actions";
import { useReport } from "./TaskSheet";

export type SavedDTO = { id: string; kind: string; text: string; source: string; detail: string | null; theme: string | null; savedAt: string };

export function SavedList({ items }: { items: SavedDTO[] }) {
  const report = useReport();
  const [list, setList] = useState(items);
  const [copied, setCopied] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!list.length) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {list.map((q) => (
        <li key={q.id} className="card animate-in flex flex-col">
          <div className="mb-3 flex items-center gap-2 text-[12px] text-ink-3">
            {q.kind === "stoic" ? <Landmark size={13} /> : <BookOpen size={13} />}
            <span className="label-mono !text-[10px]">{q.kind === "stoic" ? "Stoic" : q.theme ?? "Verse"}</span>
            <span className="ml-auto">Saved {new Date(q.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          <p className="flex-1 font-sans text-[20px] font-thin leading-[1.32] tracking-[-0.02em]">“{q.text}”</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
              <span className="font-medium text-ink">{q.source}</span>
              {q.detail ? ` · ${q.detail}` : ""}
            </span>
            <button
              className="icon-btn !h-8 !w-8"
              aria-label="Copy"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`“${q.text}” — ${q.source}${q.kind === "verse" ? " (KJV)" : ""}`);
                  setCopied(q.id);
                  setTimeout(() => setCopied(null), 1500);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied === q.id ? <Check size={14} className="text-good" /> : <Copy size={14} />}
            </button>
            <button
              className="icon-btn !h-8 !w-8"
              aria-label="Remove from saved"
              onClick={() => {
                const before = list;
                setList((l) => l.filter((x) => x.id !== q.id));
                start(async () => {
                  if (!report(await deleteSavedQuote(q.id))) setList(before);
                });
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
