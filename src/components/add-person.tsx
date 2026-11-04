"use client";

import { X } from "lucide-react";
import { useDialog } from "./dialog";
import { PersonForm } from "./person-form";

export function AddPerson({ onClose }: { onClose: () => void }) {
  const panel = useDialog<HTMLElement>(onClose);
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent" onClick={onClose} aria-hidden />
      <aside ref={panel} role="dialog" aria-modal="true" className="fade fixed right-0 top-0 z-40 flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-line bg-card p-5 shadow-[0_0_40px_rgba(0,0,0,.12)] sm:w-[420px]" aria-label="Add a person">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] leading-tight">Add a person</h2>
          <button className="btn btn-icon shrink-0" onClick={onClose} aria-label="Close"><X size={18} aria-hidden /></button>
        </div>
        <PersonForm onDone={onClose} onCancel={onClose} />
      </aside>
    </>
  );
}
