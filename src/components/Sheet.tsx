"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** iOS-style modal sheet: slides up from the bottom on phones, centered on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="sheet m-0 mt-auto w-full max-w-none rounded-t-[22px] bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[6px] sm:m-auto sm:max-w-lg sm:rounded-[22px]"
    >
      {open && (
        <div className="max-h-[88vh] overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-surface-2 sm:hidden" />
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-[19px] font-semibold">{title}</h2>
            <button aria-label="Close" onClick={onClose} className="rounded-full bg-surface-2 p-1.5 text-ink-2 hover:text-ink">
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-[13px] font-medium text-ink-2">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[12px] font-normal text-ink-3">{hint}</div>}
    </label>
  );
}

export function Toggle({ name, defaultChecked, label, hint }: { name: string; defaultChecked?: boolean; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-surface-2 px-3 py-2.5">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="block text-[12px] text-ink-2">{hint}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="switch" />
    </label>
  );
}

/** Segmented control (UISegmentedControl style) built on radio buttons. */
export function Segmented({
  name,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} onChange={() => onChange?.(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
