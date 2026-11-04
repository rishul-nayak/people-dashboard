import { TIER_DAYS, TIER_RANK } from "./config";
import type { Owed, Person } from "./types";
import { daysBetween, lines, stripDate } from "./util";

export type Ping = { person: Person; late: number; since: number | null; reason: string };

/** People whose next-contact date has come. Allies first, then the longest overdue. */
export function pingToday(people: Person[], today: string): Ping[] {
  return people
    .filter((p) => (TIER_DAYS[p.tier] ?? 0) > 0 && p.nextContact && p.nextContact <= today)
    .map((p) => ({
      person: p,
      late: daysBetween(p.nextContact as string, today),
      since: p.lastContact ? daysBetween(p.lastContact, today) : null,
      reason: reasonFor(p),
    }))
    .sort((a, b) => (TIER_RANK[a.person.tier] ?? 9) - (TIER_RANK[b.person.tier] ?? 9) || b.late - a.late);
}

function reasonFor(p: Person): string {
  const care = lines(p.caresAbout).at(-1);
  if (care) return stripDate(care);
  if (p.howMet) return p.howMet;
  return "Check in";
}

export type OwedRow = { item: Owed; person: Person | null; late: number };

export function openOwed(owed: Owed[], people: Person[], today: string): OwedRow[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return owed
    .filter((o) => !o.done)
    .map((o) => ({ item: o, person: o.personId ? byId.get(o.personId) || null : null, late: o.due ? daysBetween(o.due, today) : 0 }))
    .sort((a, b) => (a.item.due || "9999").localeCompare(b.item.due || "9999"));
}

export function addedSince(people: Person[], today: string, days: number): number {
  return people.filter((p) => daysBetween(p.created.slice(0, 10), today) <= days).length;
}
