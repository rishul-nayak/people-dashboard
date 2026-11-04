// Changes the dashboard makes by hand: add or edit a person, log a message, tick a promise.
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { TIER_DAYS, WORLDS } from "./config";
import { addDays } from "./util";

const { people, promises, interactions, interactionPeople } = schema;

const TEXT_FIELDS = ["company", "role", "howMet", "caresAbout", "personalNotes", "ideasToHelp", "commonGround", "mutualContacts", "linkedin", "email", "phone"] as const;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export class BadInput extends Error {}

type PersonPatch = Partial<typeof people.$inferInsert>;

/** Only known fields, trimmed and length-limited. Throws BadInput for a value that cannot be right. */
export function cleanPerson(input: any, { requireName }: { requireName: boolean }): PersonPatch {
  if (!input || typeof input !== "object") throw new BadInput("Send a JSON object");
  const out: PersonPatch = {};
  if ("name" in input || requireName) {
    const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!name) throw new BadInput("Name is required");
    out.name = name;
  }
  if ("tier" in input) {
    if (!(input.tier in TIER_DAYS)) throw new BadInput("Unknown tier");
    out.tier = input.tier;
  }
  if ("world" in input) {
    const w = String(input.world || "");
    if (w && !WORLDS.includes(w)) throw new BadInput("Unknown world");
    out.world = w;
  }
  for (const k of TEXT_FIELDS) if (k in input) out[k] = String(input[k] ?? "").trim().slice(0, 4000);
  if (out.email && !out.email.includes("@")) throw new BadInput("Email looks wrong");
  for (const k of ["lastContact", "nextContact"] as const) {
    if (k in input) {
      if (input[k] === null || input[k] === "") out[k] = null;
      else if (isDay(input[k])) out[k] = input[k];
      else throw new BadInput(`${k} must be YYYY-MM-DD`);
    }
  }
  return out;
}

export async function createPerson(db: DB, input: any, today: string) {
  const v = cleanPerson(input, { requireName: true });
  const tier = v.tier || "Tier 1";
  const days = TIER_DAYS[tier] ?? 0;
  const next = "nextContact" in v ? v.nextContact : days ? addDays(v.lastContact || today, days) : null;
  const [row] = await db.insert(people).values({ ...v, name: v.name as string, tier, nextContact: next }).returning();
  return row;
}

export async function updatePerson(db: DB, id: string, input: any, today: string) {
  const v = cleanPerson(input, { requireName: false });
  if (!Object.keys(v).length) throw new BadInput("Nothing to change");
  const [cur] = await db.select().from(people).where(eq(people.id, id));
  if (!cur) return null;
  // a new tier moves the next contact date, unless the date was set by hand in the same edit
  if (v.tier && v.tier !== cur.tier && !("nextContact" in v)) {
    const days = TIER_DAYS[v.tier] ?? 0;
    v.nextContact = days ? addDays(cur.lastContact || today, days) : null;
  }
  const [row] = await db.update(people).set(v).where(eq(people.id, id)).returning();
  return row;
}

/** "I messaged them today": last contact is today, next contact follows the tier. */
export async function touchPerson(db: DB, id: string, note: string | undefined, today: string) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(people).where(eq(people.id, id));
    if (!cur) return null;
    const days = TIER_DAYS[cur.tier] ?? 0;
    const [row] = await tx.update(people).set({ lastContact: today, nextContact: days ? addDays(today, days) : null }).where(eq(people.id, id)).returning();
    const [i] = await tx.insert(interactions).values({
      summary: String(note || "").trim().slice(0, 300) || "Messaged", date: today, type: "Message", source: "Manual", status: "Saved",
    }).returning({ id: interactions.id });
    await tx.insert(interactionPeople).values({ interactionId: i.id, personId: id });
    return row;
  });
}

export async function deletePerson(db: DB, id: string): Promise<boolean> {
  const rows = await db.delete(people).where(eq(people.id, id)).returning({ id: people.id });
  return rows.length > 0;
}

export async function setPromiseDone(db: DB, id: string, done: boolean): Promise<boolean> {
  const rows = await db.update(promises).set({ done }).where(eq(promises.id, id)).returning({ id: promises.id });
  return rows.length > 0;
}

export async function createPromise(db: DB, input: any, today: string) {
  const what = String(input?.what ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!what) throw new BadInput("Say what the promise is");
  const who = input.who === "Them" ? "Them" : "Me";
  const due = input.due ? (isDay(input.due) ? input.due : (() => { throw new BadInput("due must be YYYY-MM-DD"); })()) : addDays(today, who === "Me" ? 2 : 7);
  const personId = typeof input.personId === "string" && input.personId ? input.personId : null;
  const [row] = await db.insert(promises).values({ what, who, due, personId }).returning();
  return row;
}
