import { eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { Data, Interaction, Owed, Person } from "./types";
import { todayIso } from "./util";

/** Everything the dashboard and the WhatsApp commands read, straight from the database. */
export async function loadFromDb(db: DB, today = todayIso()): Promise<Data> {
  const [pRows, prRows, iRows, linkRows, edgeRows] = await Promise.all([
    db.select().from(schema.people),
    db.select().from(schema.promises),
    db.select().from(schema.interactions).where(eq(schema.interactions.status, "Saved")),
    db.select().from(schema.interactionPeople),
    db.select().from(schema.edges),
  ]);
  const knows = new Map<string, string[]>();
  const introducedBy = new Map<string, string>();
  for (const e of edgeRows) {
    if (e.kind === "knows") {
      knows.set(e.aId, [...(knows.get(e.aId) || []), e.bId]);
      knows.set(e.bId, [...(knows.get(e.bId) || []), e.aId]);
    } else if (e.kind === "introduced" && !introducedBy.has(e.bId)) {
      introducedBy.set(e.bId, e.aId);
    }
  }
  const people: Person[] = pRows.map((p) => ({
    id: p.id, name: p.name, tier: p.tier, world: p.world || "Other", company: p.company, role: p.role, howMet: p.howMet,
    caresAbout: p.caresAbout, personalNotes: p.personalNotes, ideasToHelp: p.ideasToHelp, commonGround: p.commonGround,
    mutualContacts: p.mutualContacts, linkedin: p.linkedin, email: p.email, phone: p.phone,
    lastContact: p.lastContact, nextContact: p.nextContact, created: p.createdAt,
    knowsIds: knows.get(p.id) || [], introducedById: introducedBy.get(p.id) || null,
  }));
  const owed: Owed[] = prRows.map((r) => ({
    id: r.id, what: r.what, who: r.who === "Them" ? "Them" : "Me", personId: r.personId, due: r.due, done: r.done,
  }));
  const links = new Map<string, string[]>();
  for (const l of linkRows) links.set(l.interactionId, [...(links.get(l.interactionId) || []), l.personId]);
  const interactions: Interaction[] = iRows.map((i) => ({
    id: i.id, summary: i.summary, date: i.date, type: i.type, personIds: links.get(i.id) || [], event: i.event,
  }));
  return { people, owed, interactions, today, source: "db", note: null };
}
