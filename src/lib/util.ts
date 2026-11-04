import { TIMEZONE } from "./config";

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

const DAY = 86_400_000;

function ms(iso: string): number {
  return Date.parse(iso.slice(0, 10) + "T00:00:00Z");
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ms(b) - ms(a)) / DAY);
}

export function addDays(iso: string, n: number): string {
  return new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
}

export function niceDate(iso: string | null): string {
  if (!iso) return "none";
  return new Date(ms(iso)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function longDate(iso: string): string {
  return new Date(ms(iso)).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** "3 days ago", "today", "in 2 days". */
export function relative(iso: string | null, today: string): string {
  if (!iso) return "never";
  const d = daysBetween(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function notionUrl(id: string): string {
  return "https://www.notion.so/" + id.replace(/-/g, "");
}

/** Dated lines the bot appends look like "2026-11-04: text". Newest last. */
export function lines(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Removes a leading date: "2026-11-04: x", "2026-11-04 - x" or "[2026-11-04] x". */
export function stripDate(line: string): string {
  return line.replace(/^\[?\d{4}-\d{2}-\d{2}\]?\s*[:\-–]?\s*/, "").trim();
}
