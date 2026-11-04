"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Moon, Plus, Sun } from "lucide-react";
import { pingToday, openOwed } from "@/lib/today";
import type { Data } from "@/lib/types";
import { longDate } from "@/lib/util";
import { AddPerson } from "./add-person";
import { call, useAct } from "./act";
import { PeopleTable } from "./people-table";
import { PersonCard } from "./person-card";
import { TodayView } from "./today-view";

const NetworkMap = dynamic(() => import("./network-map"), {
  ssr: false,
  loading: () => <div className="card" style={{ height: 420 }} />,
});

type Tab = "today" | "map" | "people";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "map", label: "Map" },
  { id: "people", label: "People" },
];

const SWATCH = ["var(--w1)", "var(--w2)", "var(--w3)"];

export function Dashboard({ data }: { data: Data }) {
  const [tab, setTab] = useState<Tab>("today");
  const [selected, setSelected] = useState<string | null>(null);
  const [world, setWorld] = useState("");
  const [dark, setDark] = useState(false);
  const [adding, setAdding] = useState(false);
  const imp = useAct();
  const editable = data.source === "db";

  useEffect(() => {
    const el = document.documentElement;
    const t = el.getAttribute("data-theme");
    // reading the saved theme after the first paint, so server and browser HTML match
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pd-theme", next); } catch {}
    setDark(!dark);
  };

  const close = useCallback(() => setSelected(null), []);
  const person = data.people.find((p) => p.id === selected) || null;

  const pings = useMemo(() => pingToday(data.people, data.today), [data]);
  const owed = useMemo(() => openOwed(data.owed, data.people, data.today), [data]);
  const worlds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data.people) counts.set(p.world, (counts.get(p.world) || 0) + 1);
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data]);

  const anyLate = pings.some((p) => p.late > 0) || owed.some((o) => o.item.who === "Me" && o.late > 0);
  const title =
    tab === "today"
      ? anyLate
        ? "Some people and promises are late"
        : pings.length
          ? "Nothing is late. A few people are due today"
          : "Nothing is due today"
      : tab === "map"
        ? `${data.people.length} ${data.people.length === 1 ? "person" : "people"} across ${worlds.length} ${worlds.length === 1 ? "world" : "worlds"}`
        : `All ${data.people.length} people, next to contact first`;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-4">
        <span className="font-serif text-[22px] leading-none">People</span>
        <div className="flex items-center gap-2">
          {editable && (
            <button className="btn btn-icon" onClick={() => setAdding(true)} aria-label="Add person">
              <Plus size={18} aria-hidden />
              <span className="hidden sm:inline">Add person</span>
            </button>
          )}
          <button className="btn btn-icon" onClick={flip} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Sections" className="flex gap-6 border-b border-line">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls="panel"
            onClick={() => setTab(id)}
            className={`-mb-px border-0 border-b-2 bg-transparent px-0 py-3 text-[16px] font-medium ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex flex-col gap-8 pt-8">
        {data.note && (
          <div className="pill watch !whitespace-normal !rounded-[10px] !px-3 !py-2">{data.note}</div>
        )}
        {data.canImport && (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <span>Copy your people, promises and talks from Notion into the database. Safe to press twice.</span>
            <button className="btn-main" disabled={imp.busy} onClick={() => imp.run(() => call("/api/import-notion", "POST", {}))}>
              {imp.busy ? "Importing" : "Import from Notion"}
            </button>
            {imp.error && <span className="w-full text-[13px] text-bad" role="alert">{imp.error}</span>}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {tab === "today" && <p className="m-0 text-[13px] text-ink-2">{longDate(data.today)}</p>}
          <h1 className="text-[32px] leading-tight">{title}</h1>
        </div>

        {tab === "today" && <TodayView data={data} onOpen={setSelected} />}

        {tab === "map" && (
          <div className="flex flex-col gap-4">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button className={`btn shrink-0 whitespace-nowrap ${!world ? "!border-ink !bg-ink !text-bg" : ""}`} aria-pressed={!world} onClick={() => setWorld("")}>
                All worlds
              </button>
              {worlds.map((w, i) => (
                <button key={w.name} aria-pressed={world === w.name} onClick={() => setWorld(world === w.name ? "" : w.name)} className={`btn inline-flex shrink-0 items-center gap-2 whitespace-nowrap ${world === w.name ? "!border-ink !bg-ink !text-bg" : ""}`}>
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SWATCH[i] ?? "var(--w-other)" }} aria-hidden />
                  {w.name} · {w.count}
                </button>
              ))}
            </div>
            <NetworkMap people={data.people} world={world} selectedId={selected} onSelect={setSelected} />
            <Legend />
          </div>
        )}

        {tab === "people" && <PeopleTable data={data} onOpen={setSelected} />}
      </main>

      {person && <PersonCard key={person.id} person={person} data={data} onClose={close} />}
      {adding && <AddPerson onClose={() => setAdding(false)} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-px w-5 bg-ink-2" aria-hidden /> Knows or introduced
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="inline-block w-5 border-t border-dashed border-ink-2" aria-hidden /> Same company
      </span>
      <span>Bigger dot = closer tier</span>
      <span>Grey = worlds beyond the top three</span>
    </div>
  );
}
