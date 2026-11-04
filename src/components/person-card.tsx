"use client";

import { useEffect } from "react";
import { ExternalLink, Link as LinkIcon, Mail, Phone, X } from "lucide-react";
import { TIER_DAYS } from "@/lib/config";
import type { Data, Person } from "@/lib/types";
import { daysBetween, niceDate, notionUrl, relative } from "@/lib/util";

function Field({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="whitespace-pre-line">
        {text.split("\n").map((l) => l.replace(/^(\d{4}-\d{2}-\d{2})\s*:\s*/, (_, d) => `${niceDate(d)}: `)).join("\n")}
      </div>
    </div>
  );
}

function nextLabel(p: Person, today: string): { text: string; tone: "bad" | "watch" | "plain" } {
  if ((TIER_DAYS[p.tier] ?? 0) === 0) return { text: "No reminders for this tier", tone: "plain" };
  if (!p.nextContact) return { text: "Not set", tone: "plain" };
  const d = daysBetween(p.nextContact, today);
  if (d > 0) return { text: `${d} day${d === 1 ? "" : "s"} late`, tone: "bad" };
  if (d === 0) return { text: "Today", tone: "watch" };
  return { text: `${niceDate(p.nextContact)} · ${relative(p.nextContact, today)}`, tone: "plain" };
}

export function PersonCard({ person, data, onClose }: { person: Person; data: Data; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const next = nextLabel(person, data.today);
  const recent = data.interactions
    .filter((i) => i.personIds.includes(person.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5);
  const owed = data.owed.filter((o) => !o.done && o.personId === person.id).slice(0, 5);
  const sub = [person.role, person.company].filter(Boolean).join(" at ");

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent" onClick={onClose} aria-hidden />
      <aside
        className="fade fixed right-0 top-0 z-40 flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-line bg-card p-5 shadow-[0_0_40px_rgba(0,0,0,.12)] sm:w-[420px]"
        aria-label={`${person.name} details`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight">{person.name}</h2>
            {sub && <div className="text-ink-2">{sub}</div>}
          </div>
          <button className="btn !p-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="pill plain">{person.tier}</span>
          <span className="pill plain">{person.world}</span>
          <span className={`pill ${next.tone}`}>{next.text}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[13px] text-ink-2">Last talked</div>
            <div>{person.lastContact ? relative(person.lastContact, data.today) : "never"}</div>
          </div>
          <div>
            <div className="text-[13px] text-ink-2">Next contact</div>
            <div>{niceDate(person.nextContact)}</div>
          </div>
        </div>

        <Field label="How we met" text={person.howMet} />
        <Field label="Cares about" text={person.caresAbout} />
        <Field label="Ideas to help" text={person.ideasToHelp} />
        <Field label="Common ground" text={person.commonGround} />
        <Field label="Mutual contacts" text={person.mutualContacts} />
        <Field label="Personal notes" text={person.personalNotes} />

        {owed.length > 0 && (
          <div>
            <div className="text-[13px] text-ink-2">Open promises</div>
            <ul className="m-0 list-none space-y-1 p-0">
              {owed.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-2">
                  <span>{o.what}</span>
                  <span className={`pill ${o.who === "Me" ? "watch" : "plain"}`}>{o.who === "Me" ? "I owe" : "They owe"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="text-[13px] text-ink-2">Recent talks</div>
            <ul className="m-0 list-none space-y-2 p-0">
              {recent.map((i) => (
                <li key={i.id}>
                  <span className="font-medium">{niceDate(i.date)}</span> · {i.summary}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {person.linkedin && (
            <a className="btn inline-flex items-center gap-2" href={person.linkedin} target="_blank" rel="noopener noreferrer">
              <LinkIcon size={16} /> LinkedIn
            </a>
          )}
          {person.email && (
            <a className="btn inline-flex items-center gap-2" href={`mailto:${person.email}`}>
              <Mail size={16} /> Email
            </a>
          )}
          {person.phone && (
            <a className="btn inline-flex items-center gap-2" href={`tel:${person.phone}`}>
              <Phone size={16} /> Call
            </a>
          )}
          {data.source === "notion" && (
            <a className="btn inline-flex items-center gap-2" href={notionUrl(person.id)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> Open in Notion
            </a>
          )}
        </div>
      </aside>
    </>
  );
}
