"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { openOwed, pingToday } from "@/lib/today";
import type { Data } from "@/lib/types";
import { niceDate } from "@/lib/util";
import { call, useAct } from "./act";

const SHOW = 5;

function latePill(late: number) {
  if (late > 0) return <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span>;
  if (late === 0) return <span className="pill watch">Today</span>;
  return null;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="text-[22px]">
        {title} <span className="tnum text-ink-2">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Row({
  title, detail, pill, onOpen, openDisabled, action,
}: {
  title: string; detail: string; pill: React.ReactNode; onOpen: () => void; openDisabled?: boolean;
  action?: { label: string; short: string; busy: boolean; run: () => void };
}) {
  return (
    <li className="flex items-center gap-2 border-b border-line last:border-0">
      <button
        onClick={onOpen}
        disabled={openDisabled}
        className="-mx-2 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[10px] border-0 bg-transparent px-2 py-3 text-left hover:bg-soft disabled:hover:bg-transparent"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-[13px] text-ink-2">{detail}</span>
        </span>
        {pill}
      </button>
      {action && (
        <button className="btn btn-icon shrink-0" disabled={action.busy} aria-label={action.label} title={action.label} onClick={action.run}>
          <Check size={16} aria-hidden />
          <span className="hidden sm:inline">{action.short}</span>
        </button>
      )}
    </li>
  );
}

function More({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= SHOW) return null;
  return (
    <button className="btn self-start" aria-expanded={open} onClick={onToggle}>
      {open ? "Show fewer" : `Show ${total - SHOW} more`}
    </button>
  );
}

export function TodayView({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const editable = data.source === "db";
  const { run, busy, error } = useAct();
  const [allPings, setAllPings] = useState(false);
  const [allOwed, setAllOwed] = useState(false);
  const pings = useMemo(() => pingToday(data.people, data.today), [data]);
  const owed = useMemo(() => openOwed(data.owed, data.people, data.today), [data]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Message these people" count={pings.length}>
          {pings.length === 0 && <p className="m-0 text-ink-2">No one is due. Send a WhatsApp note about someone you met.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {(allPings ? pings : pings.slice(0, SHOW)).map(({ person, late, since, reason }) => (
              <Row
                key={person.id}
                title={person.name}
                detail={`${person.tier} · ${reason !== "Check in" ? reason : since !== null ? `last talked ${since} day${since === 1 ? "" : "s"} ago` : "no talks yet"}`}
                pill={latePill(late)}
                onOpen={() => onOpen(person.id)}
                action={editable ? { label: `I messaged ${person.name}`, short: "Messaged", busy, run: () => run(() => call(`/api/people/${person.id}/touch`, "POST", {})) } : undefined}
              />
            ))}
          </ul>
          <More total={pings.length} open={allPings} onToggle={() => setAllPings(!allPings)} />
        </Section>

        <Section title="Promises to keep" count={owed.length}>
          {owed.length === 0 && <p className="m-0 text-ink-2">No open promises.</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            {(allOwed ? owed : owed.slice(0, SHOW)).map(({ item, person, late }) => (
              <Row
                key={item.id}
                title={item.what}
                detail={item.who === "Me" ? `I owe ${person ? person.name : "someone"}` : `${person ? person.name : "Someone"} owes me`}
                pill={item.due ? (late > 0 ? <span className="pill bad">{late} day{late === 1 ? "" : "s"} late</span> : <span className={`pill ${late === 0 ? "watch" : "plain"}`}>{late === 0 ? "Today" : niceDate(item.due)}</span>) : null}
                onOpen={() => person && onOpen(person.id)}
                openDisabled={!person}
                action={editable ? { label: `Mark done: ${item.what}`, short: "Done", busy, run: () => run(() => call(`/api/promises/${item.id}`, "PATCH", { done: true })) } : undefined}
              />
            ))}
          </ul>
          <More total={owed.length} open={allOwed} onToggle={() => setAllOwed(!allOwed)} />
        </Section>
      </div>
      {error && <p className="m-0 text-[13px] text-bad" role="alert">{error}</p>}
    </div>
  );
}
