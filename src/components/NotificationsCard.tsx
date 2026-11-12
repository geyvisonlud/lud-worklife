"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send, Smartphone, Trash2 } from "lucide-react";
import { pushPublicKey, removePushSubscription, savePushSubscription, sendTestNotification, setNotifyPrefs } from "@/app/actions";
import { formatClock } from "@/lib/dates";
import type { NotifyPrefs } from "@/lib/notify";
import { useReport } from "./TaskSheet";

type Device = { id: string; label: string | null; endpoint: string; createdAt: string };
type State = "loading" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

const toKey = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function deviceLabel() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
  const browser = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Edg/.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  return `${device}${standalone ? " · app" : browser ? ` · ${browser}` : ""}`;
}

/** Keeps the service worker registered (needed for notifications) on every page. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** Push notifications: turn them on for this device, choose what to be reminded of, send a test. */
export function NotificationsCard({ devices: initialDevices, prefs: initialPrefs }: { devices: Device[]; prefs: NotifyPrefs }) {
  const report = useReport();
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState(initialDevices);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [pending, start] = useTransition();
  useEffect(() => setDevices(initialDevices), [initialDevices]);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-browser" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const key = await pushPublicKey();
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
        const r = await savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, deviceLabel());
        if (report(r)) {
          setEndpoint(sub.endpoint);
          setState("on");
        }
      } catch (e) {
        report({ ok: false, error: `Couldn't turn notifications on: ${(e as Error).message}` });
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setEndpoint(null);
      setState("off");
    });

  const savePrefs = (p: NotifyPrefs) => {
    setPrefs(p);
    start(async () => void report(await setNotifyPrefs(p)));
  };

  return (
    <section className="card animate-in">
      <div className="card-head flex items-center justify-between gap-3">
        <h2 className="label-mono">Notifications</h2>
        {devices.length > 0 && (
          <button className="btn btn-ghost !py-1 !text-[12.5px]" disabled={pending} onClick={() => start(async () => void report(await sendTestNotification()))}>
            <Send size={13} /> Send a test
          </button>
        )}
      </div>

      {/* this device */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${state === "on" ? "bg-good-soft text-good" : "bg-surface text-ink-3"}`}>
          {state === "on" ? <Bell size={16} /> : <BellOff size={16} />}
        </span>
        <div className="min-w-0 flex-1 text-[13.5px]">
          <div className="font-medium">This device</div>
          <div className="text-[12.5px] text-ink-2">
            {state === "loading" && "Checking…"}
            {state === "on" && "Notifications are on here."}
            {state === "off" && "Get reminders for events and tasks on this device."}
            {state === "denied" && "Notifications are blocked for this site — allow them in the browser / iPhone Settings, then come back."}
            {state === "unsupported" && "This browser can't receive notifications."}
            {state === "ios-browser" && "On iPhone, open Lud Worklife from its Home Screen icon (iOS 16.4 or later) to turn notifications on."}
          </div>
        </div>
        {state === "off" && (
          <button className="btn btn-primary" disabled={pending} onClick={enable}>
            <Bell size={14} /> Turn on
          </button>
        )}
        {state === "on" && (
          <button className="btn btn-secondary" disabled={pending} onClick={disable}>
            Turn off
          </button>
        )}
      </div>

      {/* what to be reminded of */}
      <div className="mt-4 divide-y divide-[var(--hairline)] text-[13.5px]">
        <label className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block">Calendar events</span>
            <span className="block text-[12px] text-ink-3">Before each event (not all-day or declined ones)</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs.events} onChange={(e) => savePrefs({ ...prefs, events: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block">Task time blocks</span>
            <span className="block text-[12px] text-ink-3">When a task you put on the calendar is about to start</span>
          </span>
          <input type="checkbox" className="switch" checked={prefs.blocks} onChange={(e) => savePrefs({ ...prefs, blocks: e.target.checked })} />
        </label>
        <label className="flex items-center justify-between gap-4 py-2.5">
          <span>How long before</span>
          <select value={prefs.lead} onChange={(e) => savePrefs({ ...prefs, lead: Number(e.target.value) })} className="input !w-auto !py-1.5 !text-[13.5px]">
            {[0, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "At start time" : m === 60 ? "1 hour" : `${m} min`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-4 py-2.5">
          <label className="flex flex-1 items-center justify-between gap-4">
            <span>
              <span className="block">Tasks due today</span>
              <span className="block text-[12px] text-ink-3">One morning summary, with anything overdue</span>
            </span>
            <input type="checkbox" className="switch" checked={prefs.digest} onChange={(e) => savePrefs({ ...prefs, digest: e.target.checked })} />
          </label>
          <input
            type="time"
            aria-label="Summary time"
            value={`${String(Math.floor(prefs.digestAt / 60)).padStart(2, "0")}:${String(prefs.digestAt % 60).padStart(2, "0")}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              if (!Number.isNaN(h)) savePrefs({ ...prefs, digestAt: h * 60 + (m || 0) });
            }}
            disabled={!prefs.digest}
            className="input !w-auto !py-1.5 !text-[13.5px] disabled:opacity-40"
            title={`Summary at ${formatClock(prefs.digestAt)}`}
          />
        </div>
      </div>

      {devices.length > 0 && (
        <div className="mt-3">
          <div className="section-label mb-1">Devices</div>
          <ul>
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                <Smartphone size={14} className="text-ink-3" />
                <span className="flex-1 truncate">
                  {d.label ?? "Device"}
                  {d.endpoint === endpoint && <span className="ml-1.5 text-[11.5px] text-good">this one</span>}
                </span>
                <button
                  className="rounded p-1 text-ink-3 hover:text-bad"
                  aria-label={`Remove ${d.label ?? "device"}`}
                  onClick={() =>
                    start(async () => {
                      if (report(await removePushSubscription(d.id))) {
                        setDevices((l) => l.filter((x) => x.id !== d.id));
                        if (d.endpoint === endpoint) setState("off");
                      }
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-ink-3">Reminders are checked every 5 minutes, so they can arrive a few minutes early or late.</p>
    </section>
  );
}
