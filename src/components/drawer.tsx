"use client";

import { X } from "lucide-react";
import { useDialog } from "./dialog";

/** The side panel used for a person and for adding a person. */
export function Drawer({
  label, title, subtitle, onClose, children,
}: { label: string; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useDialog<HTMLElement>(onClose);
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 sm:bg-black/10" onClick={onClose} aria-hidden />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="slide-in fixed right-0 top-0 z-40 flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-line bg-card p-5 sm:w-[420px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight">{title}</h2>
            {subtitle && <div className="text-ink-2">{subtitle}</div>}
          </div>
          <button className="btn btn-icon shrink-0" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
