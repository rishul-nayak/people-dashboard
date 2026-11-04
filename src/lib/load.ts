import { getDb, hasDb } from "@/db";
import { loadFromDb } from "./data-db";
import { loadData as loadLegacy } from "./notion";
import type { Data } from "./types";

/** The database when DATABASE_URL is set. Otherwise the old Notion read, or sample data. */
export async function loadAny(forceDemo: boolean): Promise<Data> {
  if (forceDemo || !hasDb()) return loadLegacy(forceDemo);
  try {
    const data = await loadFromDb(await getDb());
    if (!data.people.length) {
      const canImport = !!process.env.NOTION_TOKEN;
      data.canImport = canImport;
      data.note = canImport
        ? "The database is empty. Import your people from Notion, or send a WhatsApp note."
        : "The database is empty. Add a person here, or send a WhatsApp note.";
    }
    return data;
  } catch (e) {
    const t = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return { people: [], owed: [], interactions: [], today: t, source: "db", note: `Could not read the database. ${(e as Error).message.slice(0, 160)}` };
  }
}
