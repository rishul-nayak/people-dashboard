import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { keepSeparate, merge, saveCapture, undo } from "@/capture/store";
import type { Extracted } from "@/capture/extract";
import { testDb } from "./helpers";

const person = (name: string, extra: Partial<Extracted["people"][number]> = {}) => ({
  name, company: "", role: "", world: "", howMet: "", caresAbout: "", personalNotes: "", ideasToHelp: "", commonGround: "",
  mutualContacts: "", linkedin: "", email: "", phone: "", ...extra,
});
const ex = (over: Partial<Extracted> = {}): Extracted => ({
  people: [person("Neha Sharma", { company: "Razorpay", caresAbout: "AI pricing", ideasToHelp: "Send the pricing teardown" })],
  summary: "Coffee, talked about AI pricing", type: "Meeting", date: "2026-11-03", promises: [], connections: [],
  question: "", transcript: "", followUpDraft: "", ...over,
});
const TODAY = "2026-11-04";

describe("save a capture", () => {
  it("creates a person with the 24-hour follow-up, an interaction and promises", async () => {
    const db = await testDb();
    const card = await saveCapture(db, ex({ promises: [{ who: "me", person: "Neha", what: "send deck", due: "" }, { who: "them", person: "", what: "intro to CFO", due: "2026-11-20" }] }), "Text", null, TODAY);
    const [p] = await db.select().from(schema.people);
    expect(p).toMatchObject({ name: "Neha Sharma", tier: "Tier 1", lastContact: "2026-11-03", nextContact: "2026-11-04", company: "Razorpay" });
    expect(card.people[0].status).toBe("new");
    const pr = await db.select().from(schema.promises);
    expect(pr.map((x) => [x.who, x.due, x.personId === p.id])).toEqual([["Me", "2026-11-06", true], ["Them", "2026-11-20", true]]);
    expect((await db.select().from(schema.interactionPeople)).length).toBe(1);
  });

  it("a second note updates the same person: appends dated lines, fills only empty fields, moves next contact", async () => {
    const db = await testDb();
    await saveCapture(db, ex({ people: [person("Neha Sharma", { company: "Razorpay", caresAbout: "AI pricing", howMet: "Coffee" })] }), "Text", null, TODAY);
    await saveCapture(db, ex({ date: "2026-11-04", people: [person("Neha Sharma", { howMet: "AI meetup", caresAbout: "Hiring a PM", role: "Head of Product" })] }), "Voice", "AI meetup", TODAY);
    const rows = await db.select().from(schema.people);
    expect(rows.length).toBe(1);
    expect(rows[0].howMet).toBe("Coffee"); // never overwritten
    expect(rows[0].role).toBe("Head of Product"); // filled because it was empty
    expect(rows[0].caresAbout).toBe("[2026-11-03] AI pricing\n[2026-11-04] Hiring a PM");
    expect(rows[0]).toMatchObject({ lastContact: "2026-11-04", nextContact: "2026-12-04" }); // Tier 1 = 30 days
  });

  it("a different company for the same name is a question, not a silent merge", async () => {
    const db = await testDb();
    await saveCapture(db, ex(), "Text", null, TODAY);
    const card = await saveCapture(db, ex({ people: [person("Neha Sharma", { company: "Zepto" })] }), "Text", null, TODAY);
    expect(card.maybe.length).toBe(1);
  });

  it("does not repeat a note that is already saved", async () => {
    const db = await testDb();
    await saveCapture(db, ex(), "Text", null, TODAY);
    await saveCapture(db, ex(), "Text", null, TODAY);
    const [p] = await db.select().from(schema.people);
    expect(p.caresAbout).toBe("[2026-11-03] AI pricing");
  });

  it("an older note does not move last contact back", async () => {
    const db = await testDb();
    await saveCapture(db, ex({ date: "2026-11-04" }), "Text", null, TODAY);
    await saveCapture(db, ex({ date: "2026-10-01", people: [person("Neha Sharma", { caresAbout: "Fundraising" })] }), "Text", null, TODAY);
    const [p] = await db.select().from(schema.people);
    expect(p.lastContact).toBe("2026-11-04");
  });
});

describe("undo", () => {
  it("removes a new person, promises and links", async () => {
    const db = await testDb();
    const card = await saveCapture(db, ex({ promises: [{ who: "me", person: "", what: "x", due: "" }] }), "Text", null, TODAY);
    expect(await undo(db, card.id)).toBe(true);
    expect((await db.select().from(schema.people)).length).toBe(0);
    expect((await db.select().from(schema.promises)).length).toBe(0);
    expect(await undo(db, card.id)).toBe(false);
    const [i] = await db.select().from(schema.interactions);
    expect(i.status).toBe("Undone");
  });

  it("restores an existing person to how it was", async () => {
    const db = await testDb();
    await saveCapture(db, ex(), "Text", null, TODAY);
    const before = (await db.select().from(schema.people))[0];
    const card = await saveCapture(db, ex({ date: "2026-11-04", people: [person("Neha Sharma", { caresAbout: "Hiring a PM", role: "Head of Product", email: "n@x.com" })] }), "Text", null, TODAY);
    await undo(db, card.id);
    const after = (await db.select().from(schema.people))[0];
    expect(after).toEqual(before);
  });
});

describe("maybe duplicate", () => {
  it("merge moves everything to the real person and deletes the duplicate", async () => {
    const db = await testDb();
    await saveCapture(db, ex({ people: [person("Neha Sharma", { company: "Razorpay" })] }), "Text", null, TODAY);
    const card = await saveCapture(db, ex({ date: "2026-11-04", people: [person("Neha", { caresAbout: "Hiring" })], promises: [{ who: "me", person: "Neha", what: "send intro", due: "" }] }), "Text", null, TODAY);
    expect(card.maybe.length).toBe(1);
    expect((await db.select().from(schema.people)).length).toBe(2);
    const merged = await merge(db, card.id, 0, 0);
    expect(merged?.maybe.length).toBe(0);
    const rows = await db.select().from(schema.people);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Neha Sharma");
    expect(rows[0].caresAbout).toBe("[2026-11-04] Hiring");
    const [pr] = await db.select().from(schema.promises);
    expect(pr.personId).toBe(rows[0].id);
    expect((await db.select().from(schema.interactionPeople).where(eq(schema.interactionPeople.personId, rows[0].id))).length).toBe(2);
  });

  it("undo after a merge puts the real person back", async () => {
    const db = await testDb();
    await saveCapture(db, ex({ people: [person("Neha Sharma")] }), "Text", null, TODAY);
    const before = (await db.select().from(schema.people))[0];
    const card = await saveCapture(db, ex({ date: "2026-11-04", people: [person("Neha", { caresAbout: "Hiring" })] }), "Text", null, TODAY);
    await merge(db, card.id, 0, 0);
    await undo(db, card.id);
    const rows = await db.select().from(schema.people);
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual(before);
  });

  it("keep separate drops the question and keeps both people", async () => {
    const db = await testDb();
    await saveCapture(db, ex(), "Text", null, TODAY);
    const card = await saveCapture(db, ex({ people: [person("Neha")] }), "Text", null, TODAY);
    const after = await keepSeparate(db, card.id, 0);
    expect(after?.maybe.length).toBe(0);
    expect((await db.select().from(schema.people)).length).toBe(2);
  });
});

describe("links between people", () => {
  it("saves who introduced whom and who knows whom", async () => {
    const db = await testDb();
    const card = await saveCapture(db, ex({
      people: [person("Neha Sharma"), person("Ankit Jain")],
      connections: [{ person: "Ankit Jain", other: "Neha Sharma", kind: "introduced_me" }, { person: "Ankit Jain", other: "Neha Sharma", kind: "knows" }],
    }), "Text", null, TODAY);
    const rows = await db.select().from(schema.edges);
    const by = Object.fromEntries((await db.select().from(schema.people)).map((p) => [p.name, p.id]));
    expect(rows.map((r) => r.kind).sort()).toEqual(["introduced", "knows"]);
    const intro = rows.find((r) => r.kind === "introduced")!;
    expect([intro.aId, intro.bId]).toEqual([by["Neha Sharma"], by["Ankit Jain"]]); // Neha introduced Ankit
    expect(card.links.length).toBe(2);
    await undo(db, card.id);
    expect((await db.select().from(schema.edges)).length).toBe(0);
  });

  it("links to someone already saved, and skips someone it cannot identify", async () => {
    const db = await testDb();
    await saveCapture(db, ex({ people: [person("Neha Sharma")] }), "Text", null, TODAY);
    await saveCapture(db, ex({
      people: [person("Ankit Jain")],
      connections: [{ person: "Ankit Jain", other: "Neha Sharma", kind: "introduced_me" }, { person: "Ankit Jain", other: "Some Stranger", kind: "knows" }],
    }), "Text", null, TODAY);
    expect((await db.select().from(schema.edges)).length).toBe(1);
  });
});
