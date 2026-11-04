// One-time copy of the Notion People, Promises and Interactions into the database.
// Safe to run twice: rows that came from Notion are matched by their Notion id and left alone.
import { isNotNull } from "drizzle-orm";
import { schema, type DB } from "@/db";
import type { Data } from "./types";

const { people, promises, interactions, interactionPeople, edges } = schema;
const day = (v: string | null) => (v ? v.slice(0, 10) : null);

export type ImportCounts = { people: number; promises: number; interactions: number; links: number };

export async function importFromNotion(db: DB, src: Pick<Data, "people" | "owed" | "interactions">): Promise<ImportCounts> {
  return db.transaction(async (tx) => {
    const counts: ImportCounts = { people: 0, promises: 0, interactions: 0, links: 0 };

    for (const p of src.people) {
      const rows = await tx.insert(people).values({
        name: p.name, tier: p.tier, world: p.world === "Other" ? "Other" : p.world, company: p.company, role: p.role, howMet: p.howMet,
        caresAbout: p.caresAbout, personalNotes: p.personalNotes, ideasToHelp: p.ideasToHelp, commonGround: p.commonGround,
        mutualContacts: p.mutualContacts, linkedin: p.linkedin, email: p.email, phone: p.phone,
        lastContact: day(p.lastContact), nextContact: day(p.nextContact), legacyId: p.id, createdAt: p.created,
      }).onConflictDoNothing().returning({ id: people.id });
      counts.people += rows.length;
    }
    const known = await tx.select({ id: people.id, legacy: people.legacyId }).from(people).where(isNotNull(people.legacyId));
    const map = new Map(known.map((r) => [r.legacy as string, r.id]));

    for (const p of src.people) {
      const me = map.get(p.id);
      if (!me) continue;
      for (const other of p.knowsIds) {
        const o = map.get(other);
        if (!o || o === me) continue;
        const [a, b] = [me, o].sort();
        counts.links += (await tx.insert(edges).values({ aId: a, bId: b, kind: "knows" }).onConflictDoNothing().returning({ id: edges.id })).length;
      }
      const by = p.introducedById ? map.get(p.introducedById) : null;
      if (by && by !== me) counts.links += (await tx.insert(edges).values({ aId: by, bId: me, kind: "introduced" }).onConflictDoNothing().returning({ id: edges.id })).length;
    }

    for (const o of src.owed) {
      const rows = await tx.insert(promises).values({
        what: o.what, who: o.who, personId: o.personId ? map.get(o.personId) ?? null : null, due: day(o.due), done: o.done, legacyId: o.id,
      }).onConflictDoNothing().returning({ id: promises.id });
      counts.promises += rows.length;
    }

    for (const i of src.interactions) {
      if (!i.date) continue;
      const rows = await tx.insert(interactions).values({
        summary: i.summary, date: day(i.date) as string, type: i.type, event: i.event, source: "Notion", status: "Saved", legacyId: i.id,
      }).onConflictDoNothing().returning({ id: interactions.id });
      if (!rows.length) continue;
      counts.interactions++;
      const ids = [...new Set(i.personIds.map((x) => map.get(x)).filter((x): x is string => !!x))];
      if (ids.length) await tx.insert(interactionPeople).values(ids.map((personId) => ({ interactionId: rows[0].id, personId })));
    }
    return counts;
  });
}
