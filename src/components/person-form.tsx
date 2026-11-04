"use client";

import { useState } from "react";
import { TIER_DAYS, WORLDS } from "@/lib/config";
import type { Person } from "@/lib/types";
import { call, useAct } from "./act";

const input = "w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[16px]";

type Fields = {
  name: string; tier: string; world: string; company: string; role: string; howMet: string; caresAbout: string;
  ideasToHelp: string; commonGround: string; mutualContacts: string; personalNotes: string;
  linkedin: string; email: string; phone: string; nextContact: string;
};

function start(p?: Person): Fields {
  return {
    name: p?.name || "", tier: p?.tier || "Tier 1", world: p?.world === "Other" && !p ? "" : p?.world || "", company: p?.company || "", role: p?.role || "",
    howMet: p?.howMet || "", caresAbout: p?.caresAbout || "", ideasToHelp: p?.ideasToHelp || "", commonGround: p?.commonGround || "",
    mutualContacts: p?.mutualContacts || "", personalNotes: p?.personalNotes || "", linkedin: p?.linkedin || "", email: p?.email || "",
    phone: p?.phone || "", nextContact: p?.nextContact || "",
  };
}

export function PersonForm({ person, onDone, onCancel }: { person?: Person; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<Fields>(() => start(person));
  const { run, busy, error } = useAct();
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, string | null> = { ...f };
    if (person) {
      // only send what changed, so an edit never overwrites a newer note from WhatsApp
      const before = start(person);
      for (const k of Object.keys(body) as (keyof Fields)[]) if (body[k] === before[k]) delete body[k];
      if (!Object.keys(body).length) return onDone();
    }
    if ("nextContact" in body && !body.nextContact) body.nextContact = null;
    if (!person && !body.nextContact) delete body.nextContact; // let the tier set it
    const ok = await run(() => (person ? call(`/api/people/${person.id}`, "PATCH", body) : call("/api/people", "POST", body)));
    if (ok) onDone();
  }

  const text = (k: keyof Fields, label: string, type = "text") => (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] text-ink-2">{label}</span>
      <input className={input} type={type} value={f[k]} onChange={set(k)} />
    </label>
  );
  const area = (k: keyof Fields, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] text-ink-2">{label}</span>
      <textarea className={input} rows={3} value={f[k]} onChange={set(k)} />
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {text("name", "Name")}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">Tier</span>
          <select className={input} value={f.tier} onChange={set("tier")}>
            {Object.keys(TIER_DAYS).map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-2">World</span>
          <select className={input} value={f.world} onChange={set("world")}>
            <option value="">Not set</option>
            {WORLDS.map((w) => <option key={w}>{w}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("company", "Company")}
        {text("role", "Role")}
      </div>
      {text("nextContact", "Next contact", "date")}
      {text("howMet", "How we met")}
      {area("caresAbout", "Cares about")}
      {area("ideasToHelp", "Ideas to help")}
      {area("commonGround", "Common ground")}
      {area("mutualContacts", "Mutual contacts")}
      {area("personalNotes", "Personal notes")}
      {text("linkedin", "LinkedIn link")}
      <div className="grid grid-cols-2 gap-3">
        {text("email", "Email", "email")}
        {text("phone", "Phone")}
      </div>
      {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-main" disabled={busy || !f.name.trim()}>{busy ? "Saving" : person ? "Save" : "Add person"}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
