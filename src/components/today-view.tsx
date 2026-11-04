"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { addedSince, openOwed, pingToday } from "@/lib/today";
import type { Data } from "@/lib/types";
import { niceDate } from "@/lib/util";
import { call, useAct } from "./act";

function Tile({ label, value, tag, tone }: { label: string; value: number; tag: string; tone: "good" | "bad" | "watch" | "plain" }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="num">{value}</div>
      <div><span className={`pill ${tone}`}>{tag}</span></div>
    </div>
  );
}

function latePill(late: number) {
  if (late > 0) return <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span>;
  if (late === 0) return <span className="pill watch">Today</span>;
  return null;
}

export function TodayView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const editable = data.source === "db";
  const { run, busy, error } = useAct();
  const pings = useMemo(() => pingToday(data.people, data.today), [data]);
  const owed = useMemo(() => openOwed(data.owed, data.people, data.today), [data]);
  const iOwe = owed.filter((o) => o.item.who === "Me");
  const theyOwe = owed.filter((o) => o.item.who === "Them");
  const lateOwe = iOwe.filter((o) => o.late > 0).length;
  const latePing = pings.filter((p) => p.late > 0).length;
  const added = addedSince(data.people, data.today, 7);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="To message today" value={pings.length} tag={latePing ? `${latePing} late` : "none late"} tone={latePing ? "bad" : "good"} />
        <Tile label="Promises I owe" value={iOwe.length} tag={lateOwe ? `${lateOwe} late` : "none late"} tone={lateOwe ? "bad" : "good"} />
        <Tile label="Promises they owe me" value={theyOwe.length} tag={theyOwe.some((o) => o.late > 0) ? "some late" : "none late"} tone={theyOwe.some((o) => o.late > 0) ? "watch" : "good"} />
        <Tile label="People" value={data.people.length} tag={`+${added} in the last 7 days`} tone="plain" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card fade flex flex-col gap-3">
          <h2 className="text-[22px]">Message these people today</h2>
          {pings.length === 0 && <p className="m-0 text-ink-2">No one is due. Send a WhatsApp note about someone you met.</p>}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {pings.slice(0, 5).map(({ person, late, reason }) => (
              <li key={person.id} className="flex items-start gap-1">
                <button
                  onClick={() => onOpen(person.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[10px] border-0 bg-transparent px-2 py-2 text-left hover:bg-soft"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{person.name}</span>
                    <span className="ml-2 text-[13px] text-ink-2">{person.tier}</span>
                    <span className="block truncate text-ink-2">{reason}</span>
                  </span>
                  {latePill(late)}
                </button>
                {editable && (
                  <button className="btn mt-1 !px-2 !py-1.5" disabled={busy} aria-label={`I messaged ${person.name}`} title="I messaged them" onClick={() => run(() => call(`/api/people/${person.id}/touch`, "POST", {}))}>
                    <Check size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {pings.length > 5 && <p className="m-0 text-[13px] text-ink-2">{pings.length - 5} more are in the People tab.</p>}
        </section>

        <section className="card fade flex flex-col gap-3">
          <h2 className="text-[22px]">Promises to keep</h2>
          {owed.length === 0 && <p className="m-0 text-ink-2">No open promises.</p>}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {owed.slice(0, 5).map(({ item, person, late }) => (
              <li key={item.id} className="flex items-start gap-1">
                <button
                  onClick={() => person && onOpen(person.id)}
                  disabled={!person}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[10px] border-0 bg-transparent px-2 py-2 text-left hover:bg-soft"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{item.what}</span>
                    <span className="block truncate text-ink-2">
                      {item.who === "Me" ? "I owe " : ""}{person ? person.name : "Unknown"}{item.who === "Them" ? " owes me" : ""}
                    </span>
                  </span>
                  {item.due ? (late > 0 ? <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span> : <span className={`pill ${late === 0 ? "watch" : "plain"}`}>{late === 0 ? "Today" : niceDate(item.due)}</span>) : null}
                </button>
                {editable && (
                  <button className="btn mt-1 !px-2 !py-1.5" disabled={busy} aria-label={`Mark done: ${item.what}`} title="Done" onClick={() => run(() => call(`/api/promises/${item.id}`, "PATCH", { done: true }))}>
                    <Check size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {owed.length > 5 && <p className="m-0 text-[13px] text-ink-2">{owed.length - 5} more open promises.</p>}
        </section>
      </div>
      {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
