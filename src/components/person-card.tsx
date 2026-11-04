"use client";

import { useState } from "react";
import { Check, ExternalLink, Link as LinkIcon, Mail, Pencil, Phone, Trash2, X } from "lucide-react";
import { TIER_DAYS } from "@/lib/config";
import type { Data, Person } from "@/lib/types";
import { daysBetween, niceDate, notionUrl, relative } from "@/lib/util";
import { call, useAct } from "./act";
import { useDialog } from "./dialog";
import { PersonForm } from "./person-form";

function Field({ label, text }: { label: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="whitespace-pre-line">
        {text.split("\n").map((l) => l.replace(/^\[?(\d{4}-\d{2}-\d{2})\]?\s*:?\s*/, (_, d) => `${niceDate(d)}: `)).join("\n")}
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
  const editable = data.source === "db";
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const [what, setWhat] = useState("");
  const [who, setWho] = useState<"Me" | "Them">("Me");
  const { run, busy, error } = useAct();

  const panel = useDialog<HTMLElement>(onClose);

  const next = nextLabel(person, data.today);
  const recent = data.interactions
    .filter((i) => i.personIds.includes(person.id))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5);
  const owed = data.owed.filter((o) => !o.done && o.personId === person.id).slice(0, 8);
  const sub = [person.role, person.company].filter(Boolean).join(" at ");
  const byId = new Map(data.people.map((p) => [p.id, p.name]));
  const knows = person.knowsIds.map((i) => byId.get(i)).filter(Boolean) as string[];
  const introducedBy = person.introducedById ? byId.get(person.introducedById) : null;

  async function addPromise(e: React.FormEvent) {
    e.preventDefault();
    if (!what.trim()) return;
    if (await run(() => call("/api/promises", "POST", { what, who, personId: person.id }))) setWhat("");
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 sm:bg-transparent" onClick={onClose} aria-hidden />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        className="fade fixed right-0 top-0 z-40 flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-line bg-card p-5 shadow-[0_0_40px_rgba(0,0,0,.12)] sm:w-[420px]"
        aria-label={`${person.name} details`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] leading-tight">{person.name}</h2>
            {sub && <div className="text-ink-2">{sub}</div>}
          </div>
          <button className="btn btn-icon shrink-0" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>

        {editing ? (
          <>
            <PersonForm person={person} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
              {!sure ? (
                <button className="btn inline-flex items-center gap-2 self-start" onClick={() => setSure(true)}>
                  <Trash2 size={16} /> Delete {person.name}
                </button>
              ) : (
                <>
                  <p className="m-0 text-[13px] text-ink-2">This removes {person.name} and their links to other people. Open promises stay, with no name on them. It cannot be undone.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn inline-flex items-center gap-2 !border-bad !text-bad"
                      disabled={busy}
                      onClick={async () => { if (await run(() => call(`/api/people/${person.id}`, "DELETE"))) onClose(); }}
                    >
                      <Trash2 size={16} /> Delete for good
                    </button>
                    <button className="btn" onClick={() => setSure(false)}>Keep</button>
                  </div>
                  {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="pill plain">{person.tier}</span>
              <span className="pill plain">{person.world}</span>
              <span className={`pill ${next.tone}`}>{next.text}</span>
            </div>

            {editable && (
              <div className="flex flex-wrap gap-2">
                <button className="btn-main inline-flex items-center gap-2" disabled={busy} onClick={() => run(() => call(`/api/people/${person.id}/touch`, "POST", {}))}>
                  <Check size={16} /> I messaged them today
                </button>
                <button className="btn inline-flex items-center gap-2" onClick={() => setEditing(true)}>
                  <Pencil size={16} /> Edit
                </button>
              </div>
            )}

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

            {(introducedBy || knows.length > 0) && (
              <div>
                <div className="text-[13px] text-ink-2">Connections</div>
                {introducedBy && <div>Introduced to me by {introducedBy}</div>}
                {knows.length > 0 && <div>Knows {knows.join(", ")}</div>}
              </div>
            )}

            {(owed.length > 0 || editable) && (
              <div className="flex flex-col gap-2">
                <div className="text-[13px] text-ink-2">Open promises</div>
                {owed.length === 0 && <div className="text-ink-2">None.</div>}
                <ul className="m-0 list-none space-y-1 p-0">
                  {owed.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-2">
                      <span>{o.what}{o.due ? <span className="text-ink-2"> · {niceDate(o.due)}</span> : null}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`pill ${o.who === "Me" ? "watch" : "plain"}`}>{o.who === "Me" ? "I owe" : "They owe"}</span>
                        {editable && (
                          <button className="btn !px-2 !py-1" disabled={busy} aria-label={`Mark done: ${o.what}`} onClick={() => run(() => call(`/api/promises/${o.id}`, "PATCH", { done: true }))}>
                            <Check size={14} />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {editable && (
                  <form onSubmit={addPromise} className="flex flex-wrap gap-2">
                    <input
                      value={what}
                      onChange={(e) => setWhat(e.target.value)}
                      placeholder="Add a promise"
                      aria-label="Add a promise"
                      className="min-w-0 flex-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[16px]"
                    />
                    <select value={who} onChange={(e) => setWho(e.target.value as "Me" | "Them")} aria-label="Who owes" className="rounded-[10px] border border-line bg-card px-2 py-2 text-[16px]">
                      <option value="Me">I owe</option>
                      <option value="Them">They owe</option>
                    </select>
                    <button className="btn" type="submit" disabled={busy || !what.trim()}>Add</button>
                  </form>
                )}
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

            {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}

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
          </>
        )}
      </aside>
    </>
  );
}
