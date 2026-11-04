"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, Moon, Network, Plus, Sun, Users } from "lucide-react";
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

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "today", label: "Today", icon: ListChecks },
  { id: "map", label: "Network map", icon: Network },
  { id: "people", label: "People", icon: Users },
];

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
        ? `${data.people.length} people across ${worlds.length} ${worlds.length === 1 ? "world" : "worlds"}`
        : `All ${data.people.length} people, next to contact first`;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col gap-6 px-4 pb-16 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3 border-b border-line py-3 text-[13px] text-ink-2">
        <span>People dashboard · Rishul · {longDate(data.today)}</span>
        <button className="btn !p-2" onClick={flip} aria-label={dark ? "Switch to light" : "Switch to dark"}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

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

      <h1 className="text-[32px] leading-tight">{title}</h1>

      <div role="tablist" className="flex flex-wrap items-center gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`btn inline-flex items-center gap-2 ${tab === id ? "!border-ink !bg-ink !text-bg" : ""}`}
          >
            <Icon size={16} />
            {id === "map" ? (<><span className="sm:hidden">Map</span><span className="hidden sm:inline">Network map</span></>) : label}
          </button>
        ))}
        {editable && (
          <button className="btn ml-auto inline-flex items-center gap-2" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add person
          </button>
        )}
      </div>

      {tab === "today" && <TodayView data={data} onOpen={setSelected} />}

      {tab === "map" && (
        <div className="flex flex-col gap-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <button className={`btn shrink-0 whitespace-nowrap ${!world ? "!border-ink !bg-ink !text-bg" : ""}`} aria-pressed={!world} onClick={() => setWorld("")}>
              All worlds
            </button>
            {worlds.map((w) => (
              <button key={w.name} aria-pressed={world === w.name} onClick={() => setWorld(world === w.name ? "" : w.name)} className={`btn shrink-0 whitespace-nowrap ${world === w.name ? "!border-ink !bg-ink !text-bg" : ""}`}>
                {w.name} · {w.count}
              </button>
            ))}
          </div>
          <NetworkMap people={data.people} world={world} selectedId={selected} onSelect={setSelected} />
          <Legend worlds={worlds} />
        </div>
      )}

      {tab === "people" && <PeopleTable data={data} onOpen={setSelected} />}

      {person && <PersonCard key={person.id} person={person} data={data} onClose={close} />}
      {adding && <AddPerson onClose={() => setAdding(false)} />}
    </div>
  );
}

function Legend({ worlds }: { worlds: { name: string; count: number }[] }) {
  const swatch = ["var(--w1)", "var(--w2)", "var(--w3)"];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-2">
      {worlds.slice(0, 3).map((w, i) => (
        <span key={w.name} className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: swatch[i] }} /> {w.name}
        </span>
      ))}
      {worlds.length > 3 && (
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: "var(--w-other)" }} /> Other worlds
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-px w-5 bg-ink-2" /> Knows or introduced
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="inline-block w-5 border-t border-dashed border-ink-3" /> Same company
      </span>
      <span>Bigger dot = closer tier</span>
    </div>
  );
}
