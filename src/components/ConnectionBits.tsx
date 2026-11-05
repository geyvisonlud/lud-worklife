"use client";

import { useActionState, useState, useTransition } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { connectNotionToken, disconnectCalendarAccount, disconnectNotion, setCalendarColor, setCalendarVisible, syncCalendarsNow, syncNotionNow, type ActionResult } from "@/app/actions";
import { CALENDAR_SWATCHES } from "@/lib/colors";
import type { CalendarDTO } from "@/lib/data";
import { useReport } from "./TaskSheet";

export function SyncButton({ kind }: { kind: "google" | "notion" }) {
  const report = useReport();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-secondary"
      disabled={pending}
      onClick={() => start(async () => void report(await (kind === "google" ? syncCalendarsNow() : syncNotionNow())))}
    >
      <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Syncing…" : "Sync now"}
    </button>
  );
}

export function DisconnectButton({ kind, id, label }: { kind: "google" | "notion"; id: string; label: string }) {
  const report = useReport();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button className="btn btn-ghost" onClick={() => setConfirm(true)} aria-label={`Disconnect ${label}`}>
        <Unplug size={14} />
      </button>
    );
  return (
    <button
      className="btn btn-danger"
      disabled={pending}
      onClick={() => start(async () => void report(await (kind === "google" ? disconnectCalendarAccount(id) : disconnectNotion(id))))}
    >
      Disconnect {label}
    </button>
  );
}

/** One calendar: visibility + color (Google's, or a local override from Google's palette). */
export function CalendarRow({ cal, googleColor, overridden }: { cal: CalendarDTO; googleColor: string; overridden: boolean }) {
  const report = useReport();
  const [on, setOn] = useState(cal.visible);
  const [color, setColor] = useState(cal.color);
  const [picker, setPicker] = useState(false);
  const [, start] = useTransition();
  const pick = (hex: string | null) => {
    setPicker(false);
    setColor(hex ?? googleColor);
    start(async () => void report(await setCalendarColor(cal.id, hex)));
  };
  return (
    <li className="list-row py-2">
      <div className="flex items-center gap-3">
        <button
          className="h-5 w-5 shrink-0 rounded-[6px] ring-offset-2 ring-offset-[var(--surface)] hover:ring-2 hover:ring-[var(--hairline-strong)]"
          style={{ background: color }}
          aria-label={`Change color of ${cal.name}`}
          onClick={() => setPicker((v) => !v)}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]">
            {cal.name}
            {cal.primary && <span className="ml-1.5 text-[11.5px] text-ink-3">primary</span>}
          </div>
          <div className="text-[11.5px] text-ink-3">
            {overridden ? "Custom color here" : "Same color as in Google"} · {cal.canWrite ? "can add events" : "read-only"}
          </div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={on}
          aria-label={`Show ${cal.name}`}
          onChange={() => {
            const next = !on;
            setOn(next);
            start(async () => {
              if (!report(await setCalendarVisible(cal.id, next))) setOn(!next);
            });
          }}
        />
      </div>
      {picker && (
        <div className="mt-2 rounded-xl bg-surface-2 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {CALENDAR_SWATCHES.map((s) => (
              <button
                key={s.hex}
                title={s.name}
                aria-label={s.name}
                onClick={() => pick(s.hex)}
                className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                style={{ background: s.hex, boxShadow: color === s.hex ? `0 0 0 2px var(--surface-2), 0 0 0 4px ${s.hex}` : undefined }}
              />
            ))}
          </div>
          {overridden && (
            <button className="btn btn-plain mt-1.5 !px-0 text-[12.5px]" onClick={() => pick(null)}>
              Use Google's color
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function NotionTokenForm({ defaultEmail }: { defaultEmail: string }) {
  const report = useReport();
  const [state, action, pending] = useActionState(async (prev: ActionResult | null, form: FormData) => {
    const r = await connectNotionToken(prev, form);
    report(r);
    return r;
  }, null);
  return (
    <form action={action} className="space-y-2.5">
      <input name="token" type="password" placeholder="ntn_… (internal integration secret)" className="input !text-[14px]" required autoComplete="off" />
      <input name="email" type="email" placeholder="Your email in that workspace" defaultValue={defaultEmail} className="input !text-[14px]" />
      {state && !state.ok && <p className="text-[12.5px] text-bad">{state.error}</p>}
      <button className="btn btn-secondary" disabled={pending}>
        {pending ? "Connecting…" : "Connect with a secret"}
      </button>
    </form>
  );
}
