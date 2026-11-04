"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TIER_DAYS } from "@/lib/config";
import type { Data } from "@/lib/types";
import { daysBetween, niceDate } from "@/lib/util";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
            className="w-full rounded-[10px] border border-line bg-card py-2.5 pl-9 pr-3 text-[16px]"
          />
        </label>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier" className="rounded-[10px] border border-line bg-card px-3 py-2.5 text-[16px]">
          <option value="">All tiers</option>
          {tiers.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={world} onChange={(e) => setWorld(e.target.value)} aria-label="World" className="rounded-[10px] border border-line bg-card px-3 py-2.5 text-[16px]">
          <option value="">All worlds</option>
          {worlds.map((w) => <option key={w}>{w}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-[13px] text-ink-2">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Tier</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">World</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Company</th>
              <th className="px-4 py-3 font-medium">Next contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const late = p.nextContact && (TIER_DAYS[p.tier] ?? 0) > 0 ? daysBetween(p.nextContact, data.today) : null;
              return (
                <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-soft">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3"><span className="pill plain">{p.tier}</span></td>
                  <td className="hidden px-4 py-3 text-ink-2 md:table-cell">{p.world}</td>
                  <td className="hidden px-4 py-3 text-ink-2 lg:table-cell">{p.company || "none"}</td>
                  <td className="px-4 py-3">
                    {late !== null && late > 0 ? <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span> : <span className="text-ink-2">{niceDate(p.nextContact)}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-ink-2">No one matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
