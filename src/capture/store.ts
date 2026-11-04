// Everything capture reads and writes in the database.
// Every capture makes one interaction. Its "data" column remembers what the capture created and the
// old value of everything it changed, so Undo and Merge are exact.
import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { CAPTURE, TIER_DAYS } from "@/lib/config";
import { addDays, stripDate } from "@/lib/util";
import type { ConnectionIn, Extracted, PersonIn } from "./extract";
import { find, nameScore, type Row } from "./match";

const { people, interactions, interactionPeople, promises, edges } = schema;
export type PersonRow = typeof people.$inferSelect;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// Fields where an existing person gets a new dated line, or is filled only when empty.
const APPEND = ["caresAbout", "personalNotes", "ideasToHelp", "commonGround", "mutualContacts"] as const;
const FILL = ["company", "role", "howMet"] as const;
const OTHER = ["world", "linkedin", "email", "phone"] as const;

export type CardPerson = { id: string; name: string; status: "new" | "updated"; tier?: string; next: string | null; idea: string };
export type CardPromise = { who: "me" | "them"; person: string; what: string; due: string };
export type CardLink = { text: string };
export type Maybe = { k: number; new: string; cands: string[]; names: string[] };
export type Card = {
  id: string; type: string; date: string; event: string; people: CardPerson[]; promises: CardPromise[];
  links: CardLink[]; question: string; draft: string; maybe: Maybe[];
};
type Data = { created: string[]; snap: Record<string, Record<string, any>>; promises: string[]; edges: string[]; maybe: Maybe[]; card: Omit<Card, "id" | "maybe"> };

const asRow = (p: PersonRow): Row & PersonRow => p;

export async function allPeople(db: DB | Tx): Promise<PersonRow[]> {
  return db.select().from(people).orderBy(asc(people.name));
}

/** New values for an existing person, plus the old values (for Undo). */
function updateProps(row: PersonRow, p: PersonIn, day: string): { set: Partial<PersonRow>; snap: Record<string, any> } {
  const set: Record<string, any> = {};
  const snap: Record<string, any> = {};
  for (const k of [...FILL, ...APPEND] as const) {
    const nv = p[k];
    const old = row[k];
    if (!nv || old.includes(nv)) continue;
    if ((APPEND as readonly string[]).includes(k)) set[k] = (old ? old + "\n" : "") + `[${day}] ${nv}`;
    else if (!old) set[k] = nv;
    else continue;
    snap[k] = old;
  }
  for (const k of OTHER) {
    if (p[k] && !row[k]) {
      set[k] = p[k];
      snap[k] = "";
    }
  }
  if (!row.lastContact || day >= row.lastContact) {
    set.lastContact = day;
    snap.lastContact = row.lastContact;
    const days = TIER_DAYS[row.tier || CAPTURE.newTier] ?? 0;
    if (days) {
      set.nextContact = addDays(day, days);
      snap.nextContact = row.nextContact;
    }
  }
  return { set, snap };
}

const stamp = (day: string, text: string) => (text ? `[${day}] ${text}` : "");

function newPersonValues(p: PersonIn, day: string, next: string | null) {
  return {
    name: p.name, tier: CAPTURE.newTier, world: p.world, company: p.company, role: p.role, howMet: p.howMet,
    caresAbout: stamp(day, p.caresAbout), personalNotes: stamp(day, p.personalNotes), ideasToHelp: stamp(day, p.ideasToHelp),
    commonGround: stamp(day, p.commonGround), mutualContacts: stamp(day, p.mutualContacts), linkedin: p.linkedin, email: p.email, phone: p.phone,
    lastContact: day, nextContact: next,
  };
}

function promisePerson(personName: string, ex: PersonIn[], ids: string[]): string | null {
  if (!ids.length) return null;
  if (personName) {
    const best = ex.map((p, i) => ({ s: nameScore(personName, p.name), id: ids[i] })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s >= 0.72) return best.id;
  }
  return ids[0];
}

// ---------- pending (Gemini was busy) ----------
export type Payload = { text: string; source: string; mediaId?: string; mime?: string; context?: string };

export async function savePending(db: DB, payload: Payload, today: string, reason: string): Promise<string> {
  const [row] = await db.insert(interactions).values({
    summary: "Waiting for Gemini", date: today, type: "Note", source: payload.source, status: "Pending",
    raw: payload.text, data: { payload, tries: 0, reason: reason.slice(0, 100) },
  }).returning({ id: interactions.id });
  return row.id;
}

export async function pendingRows(db: DB, limit = 5) {
  return db.select().from(interactions).where(eq(interactions.status, "Pending")).orderBy(asc(interactions.createdAt)).limit(limit);
}

export async function bumpPending(db: DB, id: string, giveUp: boolean): Promise<void> {
  const [row] = await db.select().from(interactions).where(eq(interactions.id, id));
  if (!row) return;
  const data = { ...row.data, tries: (row.data.tries || 0) + 1 };
  await db.update(interactions).set({ data, ...(giveUp ? { status: "Error" } : {}) }).where(eq(interactions.id, id));
}

export async function markInteraction(db: DB, id: string, status: string): Promise<void> {
  await db.update(interactions).set({ status }).where(eq(interactions.id, id));
}

// ---------- capture ----------
// Two notes sent at the same moment must not both create "Neha": one waits for the other.
const lock = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(727202)`);

export async function saveCapture(db: DB, ex: Extracted, source: string, event: string | null, today: string, existingId?: string): Promise<Card> {
  return db.transaction(async (tx) => {
    await lock(tx);
    const rows = await allPeople(tx);
    const data: Data = { created: [], snap: {}, promises: [], edges: [], maybe: [], card: null as any };
    const cardPeople: CardPerson[] = [];
    const ids: string[] = [];

    for (const p of ex.people) {
      const found = find(p, rows.map(asRow));
      if (found.kind === "same") {
        const row = rows.find((r) => r.id === found.rows[0].id)!;
        const { set, snap } = updateProps(row, p, ex.date);
        if (Object.keys(set).length) {
          data.snap[row.id] = snap;
          await tx.update(people).set(set).where(eq(people.id, row.id));
          Object.assign(row, set);
        }
        cardPeople.push({ id: row.id, name: row.name, status: "updated", next: row.nextContact, idea: p.ideasToHelp });
        ids.push(row.id);
        continue;
      }
      const next = addDays(ex.date, CAPTURE.firstFollowUpDays); // the 24-hour follow-up comes first
      const [created] = await tx.insert(people).values(newPersonValues(p, ex.date, next)).returning();
      rows.push(created);
      data.created.push(created.id);
      ids.push(created.id);
      cardPeople.push({ id: created.id, name: created.name, status: "new", tier: created.tier, next, idea: p.ideasToHelp });
      if (found.kind === "maybe") {
        data.maybe.push({ k: cardPeople.length - 1, new: created.id, cands: found.rows.map((r) => r.id), names: found.rows.map((r) => r.name) });
      }
    }

    const values = {
      summary: ex.summary, date: ex.date, type: ex.type, event: event || "", status: "Saved", source, raw: ex.transcript || "",
    };
    let iid: string;
    if (existingId) {
      await tx.update(interactions).set(values).where(eq(interactions.id, existingId));
      iid = existingId;
    } else {
      iid = (await tx.insert(interactions).values({ ...values, data: {} }).returning({ id: interactions.id }))[0].id;
    }
    const unique = [...new Set(ids)];
    if (unique.length) await tx.insert(interactionPeople).values(unique.map((personId) => ({ interactionId: iid, personId }))).onConflictDoNothing();

    const cardPromises: CardPromise[] = [];
    for (const pr of ex.promises) {
      const pid = promisePerson(pr.person, ex.people, ids);
      const due = pr.due || addDays(today, CAPTURE.promiseDueDays[pr.who]);
      const [row] = await tx.insert(promises).values({ what: pr.what, who: pr.who === "me" ? "Me" : "Them", personId: pid, due, interactionId: iid }).returning({ id: promises.id });
      data.promises.push(row.id);
      const who = cardPeople.find((c) => c.id === pid)?.name || pr.person;
      cardPromises.push({ who: pr.who, person: who, what: pr.what, due });
    }

    const links = await saveConnections(tx, ex.connections, rows, ids, ex.people, iid, data);

    data.card = {
      type: ex.type, date: ex.date, event: event || "", people: cardPeople, promises: cardPromises, links,
      question: ex.question, draft: ex.followUpDraft,
    };
    await tx.update(interactions).set({ data }).where(eq(interactions.id, iid));
    return { id: iid, ...data.card, maybe: data.maybe };
  });
}

/** Who knows whom. Only links where both people are clearly identified are saved. */
async function saveConnections(tx: Tx, conns: ConnectionIn[], rows: PersonRow[], ids: string[], extracted: PersonIn[], iid: string, data: Data): Promise<CardLink[]> {
  const out: CardLink[] = [];
  const resolve = (name: string): PersonRow | null => {
    // someone in this note first, then anyone we already know (only if clearly the same person)
    const inNote = extracted.map((p, i) => ({ s: nameScore(name, p.name), id: ids[i] })).sort((a, b) => b.s - a.s)[0];
    if (inNote && inNote.s >= 0.92) return rows.find((r) => r.id === inNote.id) || null;
    const f = find({ name }, rows.map(asRow));
    return f.kind === "same" ? rows.find((r) => r.id === f.rows[0].id) || null : null;
  };
  for (const c of conns) {
    const a = resolve(c.person);
    const b = resolve(c.other);
    if (!a || !b || a.id === b.id) continue;
    const intro = c.kind === "introduced_me";
    const [x, y] = intro ? [b.id, a.id] : [a.id, b.id].sort(); // intro: x introduced y. knows: stored once.
    const [row] = await tx.insert(edges).values({ aId: x, bId: y, kind: intro ? "introduced" : "knows", interactionId: iid }).onConflictDoNothing().returning({ id: edges.id });
    if (!row) continue;
    data.edges.push(row.id);
    out.push({ text: intro ? `${b.name} introduced you to ${a.name}.` : `${a.name} and ${b.name} know each other.` });
  }
  return out;
}

// ---------- buttons ----------
export async function undo(db: DB, iid: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lock(tx);
    const [row] = await tx.select().from(interactions).where(eq(interactions.id, iid));
    if (!row || row.status === "Undone") return false;
    const d = row.data as Partial<Data>;
    if (d.promises?.length) await tx.delete(promises).where(inArray(promises.id, d.promises));
    if (d.edges?.length) await tx.delete(edges).where(inArray(edges.id, d.edges));
    if (d.created?.length) await tx.delete(people).where(inArray(people.id, d.created));
    for (const [pid, old] of Object.entries(d.snap || {})) await tx.update(people).set(old).where(eq(people.id, pid));
    await tx.delete(interactionPeople).where(eq(interactionPeople.interactionId, iid));
    await tx.update(interactions).set({ status: "Undone" }).where(eq(interactions.id, iid));
    return true;
  });
}

export async function lastSaved(db: DB): Promise<string | null> {
  const [row] = await db.select({ id: interactions.id }).from(interactions).where(eq(interactions.status, "Saved")).orderBy(desc(interactions.createdAt)).limit(1);
  return row?.id || null;
}

export async function getCard(db: DB, iid: string): Promise<Card | null> {
  const [row] = await db.select().from(interactions).where(eq(interactions.id, iid));
  if (!row || !(row.data as Partial<Data>).card) return null;
  const d = row.data as Data;
  return { id: iid, ...d.card, maybe: d.maybe || [] };
}

/** The new person from maybe[k] is really candidate j: move everything over, delete the duplicate. */
export async function merge(db: DB, iid: string, k: number, j: number): Promise<Card | null> {
  return db.transaction(async (tx) => {
    await lock(tx);
    const [row] = await tx.select().from(interactions).where(eq(interactions.id, iid));
    if (!row) return null;
    const d = row.data as Data;
    const m = d.maybe.find((x) => x.k === k);
    if (!m || !m.cands[j]) return { id: iid, ...d.card, maybe: d.maybe };
    const [fresh] = await tx.select().from(people).where(eq(people.id, m.new));
    const [cand] = await tx.select().from(people).where(eq(people.id, m.cands[j]));
    if (!fresh || !cand) return { id: iid, ...d.card, maybe: d.maybe };

    // the duplicate's notes carry a date stamp already; updateProps adds its own
    const asInput = { ...fresh } as unknown as PersonIn;
    for (const k of APPEND) asInput[k] = stripDate(fresh[k]);
    const { set, snap } = updateProps(cand, asInput, d.card.date);
    if (Object.keys(set).length) {
      d.snap[cand.id] = d.snap[cand.id] || snap; // keep the oldest values for Undo
      await tx.update(people).set(set).where(eq(people.id, cand.id));
    }
    await tx.insert(interactionPeople).values({ interactionId: iid, personId: cand.id }).onConflictDoNothing();
    await tx.update(promises).set({ personId: cand.id }).where(eq(promises.personId, fresh.id));
    // move links from the duplicate to the real person
    const touching = await tx.select().from(edges).where(or(eq(edges.aId, fresh.id), eq(edges.bId, fresh.id)));
    for (const e of touching) {
      const a = e.aId === fresh.id ? cand.id : e.aId;
      const b = e.bId === fresh.id ? cand.id : e.bId;
      d.edges = d.edges.filter((x) => x !== e.id);
      if (a === b) continue;
      const [x, y] = e.kind === "knows" ? [a, b].sort() : [a, b];
      const [ins] = await tx.insert(edges).values({ aId: x, bId: y, kind: e.kind, interactionId: iid }).onConflictDoNothing().returning({ id: edges.id });
      if (ins) d.edges.push(ins.id);
    }
    await tx.delete(people).where(eq(people.id, fresh.id)); // links of the duplicate go with it
    d.created = d.created.filter((x) => x !== fresh.id);
    d.maybe = d.maybe.filter((x) => x.k !== k);
    const oldName = d.card.people[k].name;
    d.card.people[k] = { id: cand.id, name: cand.name, status: "updated", next: set.nextContact ?? cand.nextContact, idea: d.card.people[k].idea };
    for (const pr of d.card.promises) if (pr.person === oldName) pr.person = cand.name;
    await tx.update(interactions).set({ data: d }).where(eq(interactions.id, iid));
    return { id: iid, ...d.card, maybe: d.maybe };
  });
}

export async function keepSeparate(db: DB, iid: string, k: number): Promise<Card | null> {
  const [row] = await db.select().from(interactions).where(eq(interactions.id, iid));
  if (!row) return null;
  const d = row.data as Data;
  d.maybe = d.maybe.filter((x) => x.k !== k);
  await db.update(interactions).set({ data: d }).where(eq(interactions.id, iid));
  return { id: iid, ...d.card, maybe: d.maybe };
}

// ---------- reads for commands ----------
export async function openPromises(db: DB) {
  const rows = await db.select().from(promises).where(eq(promises.done, false)).orderBy(sql`${promises.due} asc nulls last`);
  return rows;
}

export async function findPeopleByName(db: DB, q: string): Promise<PersonRow[]> {
  const rows = await allPeople(db);
  const ql = q.toLowerCase();
  return rows
    .map((p) => ({ s: Math.max(nameScore(q, p.name), p.name.toLowerCase().includes(ql) ? 0.75 : 0), p }))
    .filter((x) => x.s >= 0.72)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.p);
}


