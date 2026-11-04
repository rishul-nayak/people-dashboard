import { boolean, date, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();
const txt = (name: string) => text(name).notNull().default("");
const day = (name: string) => date(name, { mode: "string" });

export const people = pgTable("people", {
  id: id(),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("Tier 1"),
  world: txt("world"),
  company: txt("company"),
  role: txt("role"),
  howMet: txt("how_met"),
  caresAbout: txt("cares_about"),
  personalNotes: txt("personal_notes"),
  ideasToHelp: txt("ideas_to_help"),
  commonGround: txt("common_ground"),
  mutualContacts: txt("mutual_contacts"),
  linkedin: txt("linkedin"),
  email: txt("email"),
  phone: txt("phone"),
  lastContact: day("last_contact"),
  nextContact: day("next_contact"),
  legacyId: text("legacy_id").unique(),
  createdAt: created(),
});

export const interactions = pgTable("interactions", {
  id: id(),
  summary: txt("summary"),
  date: day("date").notNull(),
  type: text("type").notNull().default("Note"),
  source: text("source").notNull().default("Text"),
  event: txt("event"),
  raw: txt("raw"),
  status: text("status").notNull().default("Saved"),
  data: jsonb("data").$type<Record<string, any>>().notNull().default({}),
  legacyId: text("legacy_id").unique(),
  createdAt: created(),
});

export const interactionPeople = pgTable(
  "interaction_people",
  {
    interactionId: uuid("interaction_id").notNull().references(() => interactions.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.interactionId, t.personId] })],
);

export const promises = pgTable("promises", {
  id: id(),
  what: text("what").notNull(),
  who: text("who").notNull().default("Me"),
  personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
  due: day("due"),
  done: boolean("done").notNull().default(false),
  interactionId: uuid("interaction_id").references(() => interactions.id, { onDelete: "set null" }),
  legacyId: text("legacy_id").unique(),
  createdAt: created(),
});

// kind "knows": the two people know each other (stored once, smaller id first).
// kind "introduced": a introduced b to Rishul (a is the introducer).
export const edges = pgTable(
  "edges",
  {
    id: id(),
    aId: uuid("a_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    bId: uuid("b_id").notNull().references(() => people.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("knows"),
    note: txt("note"),
    interactionId: uuid("interaction_id").references(() => interactions.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [unique("edges_unique").on(t.aId, t.bId, t.kind)],
);

export const waMessages = pgTable("wa_messages", {
  id: text("id").primaryKey(),
  direction: text("direction").notNull(),
  body: txt("body"),
  interactionId: uuid("interaction_id").references(() => interactions.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<any>().notNull(),
});
