import { IDS, WORLDS } from "./config";
import { demoData } from "./demo";
import type { Data, Interaction, Owed, Person } from "./types";
import { todayIso } from "./util";

const VERSION = "2026-03-11";
const BASE = "https://api.notion.com/v1";

type Page = { id: string; created_time: string; properties: Record<string, any> };

async function queryAll(ds: string, token: string): Promise<Page[]> {
  const out: Page[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${BASE}/data_sources/${ds}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = await res.json();
    out.push(...body.results);
    if (!body.has_more) break;
    cursor = body.next_cursor;
  }
  return out;
}

// ---- property readers (same idea as the bot's prop()) ----
function read(page: Page, name: string): any {
  const p = page.properties[name];
  if (!p) return null;
  const v = p[p.type];
  switch (p.type) {
    case "title":
    case "rich_text":
      return (v || []).map((x: any) => x.plain_text || "").join("");
    case "select":
      return v ? v.name : null;
    case "date":
      return v ? v.start : null;
    case "relation":
      return (v || []).map((x: any) => x.id);
    default:
      return v;
  }
}
const str = (page: Page, name: string): string => (read(page, name) as string) || "";
const ids = (page: Page, name: string): string[] => (read(page, name) as string[]) || [];

function toPerson(p: Page): Person {
  const world = str(p, "World");
  return {
    id: p.id,
    name: str(p, "Name") || "Unnamed",
    tier: str(p, "Tier") || "Tier 1",
    world: WORLDS.includes(world) ? world : world || "Other",
    company: str(p, "Company"),
    role: str(p, "Role"),
    howMet: str(p, "How we met"),
    caresAbout: str(p, "Cares about"),
    personalNotes: str(p, "Personal notes"),
    ideasToHelp: str(p, "Ideas to help"),
    commonGround: str(p, "Common ground"),
    mutualContacts: str(p, "Mutual contacts"),
    linkedin: str(p, "LinkedIn"),
    email: str(p, "Email"),
    phone: str(p, "Phone"),
    lastContact: read(p, "Last contact"),
    nextContact: read(p, "Next contact"),
    created: p.created_time,
    // Optional columns. The bot does not write these yet.
    knowsIds: ids(p, "Knows"),
    introducedById: ids(p, "Introduced by")[0] || null,
  };
}

function toOwed(p: Page): Owed {
  return {
    id: p.id,
    what: str(p, "What") || "Promise",
    who: read(p, "Who") === "Them" ? "Them" : "Me",
    personId: ids(p, "Person")[0] || null,
    due: read(p, "Due"),
    done: !!read(p, "Done"),
  };
}

function toInteraction(p: Page): Interaction | null {
  const status = read(p, "Status");
  if (status === "Undone" || status === "Pending" || status === "Error") return null;
  return {
    id: p.id,
    summary: str(p, "Summary"),
    date: read(p, "Date"),
    type: read(p, "Type") || "Note",
    personIds: ids(p, "People"),
    event: str(p, "Event"),
  };
}

export async function loadData(forceDemo = false): Promise<Data> {
  const today = todayIso();
  const token = process.env.NOTION_TOKEN;
  if (forceDemo || !token) {
    const demo = demoData(today);
    demo.note = forceDemo
      ? "Sample data. Remove ?demo=1 to see your people."
      : "Sample data. Add NOTION_TOKEN in the Vercel settings to see your people.";
    return demo;
  }
  try {
    const [people, owed, inter] = await Promise.all([
      queryAll(IDS.people, token),
      queryAll(IDS.promises, token),
      queryAll(IDS.interactions, token),
    ]);
    return {
      people: people.map(toPerson),
      owed: owed.map(toOwed),
      interactions: inter.map(toInteraction).filter((x): x is Interaction => x !== null),
      today,
      source: "notion",
      note: null,
    };
  } catch (e) {
    return { people: [], owed: [], interactions: [], today, source: "notion", note: `Could not read Notion. ${(e as Error).message}` };
  }
}
