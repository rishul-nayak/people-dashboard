"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TIER_DAYS } from "@/lib/config";
import type { Data, Person } from "@/lib/types";
import { daysBetween, niceDate } from "@/lib/util";

const field = "rounded-[10px] border border-line bg-card px-3 py-2.5 text-[16px]";

function Status({ p, today }: { p: Person; today: string }) {
  if ((TIER_DAYS[p.tier] ?? 0) === 0) return <span className="text-ink-2">No reminders</span>;
  if (!p.nextContact) return <span className="text-ink-2">Not set</span>;
  const late = daysBetween(p.nextContact, today);
  if (late > 0) return <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span>;
  if (late === 0) return <span className="pill watch">Today</span>;
  return <span className="text-ink-2">{niceDate(p.nextContact)}</span>;
}

export function PeopleTable({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [world, setWorld] = useState("");

  const tiers = useMemo(() => Array.from(new Set(data.people.map((p) => p.tier))), [data]);
  const worlds = useMemo(() => Array.from(new Set(data.people.map((p) => p.world))), [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.people
      .filter((p) => (!tier || p.tier === tier) && (!world || p.world === world))
      .filter((p) => !needle || [p.name, p.company, p.role, p.caresAbout].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (a.nextContact || "9999").localeCompare(b.nextContact || "9999") || a.name.localeCompare(b.name));
  }, [data, q, tier, world]);

  const filtered = !!(q || tier || world);
  const clear = () => { setQ(""); setTier(""); setWorld(""); };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <label className="relative col-span-2 min-w-[200px] sm:flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, role, interests"
            aria-label="Search people"
            className={`${field} w-full pl-9`}
          />
        </label>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier" className={field}>
          <option value="">All tiers</option>
          {tiers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={world} onChange={(e) => setWorld(e.target.value)} aria-label="World" className={field}>
          <option value="">All worlds</option>
          {worlds.map((w) => <option key={w}>{w}</option>)}
        </select>
      </div>

      <p className="m-0 text-[13px] text-ink-2" aria-live="polite">
        {filtered ? `${rows.length} of ${data.people.length} people` : `${rows.length} ${rows.length === 1 ? "person" : "people"}`}
      </p>

      {rows.length === 0 && (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="m-0 text-ink-2">No one matches.</p>
          {filtered && <button className="btn" onClick={clear}>Clear search and filters</button>}
        </div>
      )}

      {/* narrow screens: one line per person, nothing cut off */}
      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0 md:hidden">
          {rows.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <button onClick={() => onOpen(p.id)} className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-[10px] border-0 bg-transparent px-2 py-3 text-left hover:bg-soft">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-[13px] text-ink-2">{[p.tier, p.company].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 text-[13px]"><Status p={p} today={data.today} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-[13px] text-ink-2">
                <th scope="col" className="py-3 pr-4 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                <th scope="col" className="px-4 py-3 font-medium">World</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Company</th>
                <th scope="col" className="py-3 pl-4 font-medium">Next contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-soft">
                  <td className="max-w-[320px] py-3 pr-4 font-medium">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} className="block max-w-full truncate border-0 bg-transparent p-0 text-left font-medium text-ink">
                      {p.name}
                    </button>
                  </td>
                  <td className="px-4 py-3"><span className="pill plain">{p.tier}</span></td>
                  <td className="px-4 py-3 text-ink-2">{p.world}</td>
                  <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{p.company || <span aria-label="No company">–</span>}</td>
                  <td className="py-3 pl-4"><Status p={p} today={data.today} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
