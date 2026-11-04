import { describe, expect, it } from "vitest";
import { schema } from "@/db";
import { importFromNotion } from "@/lib/import-notion";
import { loadFromDb } from "@/lib/data-db";
import type { Person } from "@/lib/types";
import { testDb } from "./helpers";

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, tier: "Tier 1", world: "Startups & tech", company: "", role: "", howMet: "", caresAbout: "", personalNotes: "", ideasToHelp: "",
  commonGround: "", mutualContacts: "", linkedin: "", email: "", phone: "", lastContact: "2026-11-01T10:00:00.000+05:30", nextContact: "2026-12-01",
  created: "2026-10-20T08:00:00.000Z", knowsIds: [], introducedById: null, ...extra,
});

const src = {
  people: [person("n1", "Neha Sharma", { knowsIds: ["n2"] }), person("n2", "Ankit Jain", { introducedById: "n1", tier: "Ally" })],
  owed: [{ id: "p1", what: "send deck", who: "Me" as const, personId: "n1", due: "2026-11-06", done: false }, { id: "p2", what: "intro", who: "Them" as const, personId: null, due: null, done: true }],
  interactions: [{ id: "i1", summary: "Coffee", date: "2026-11-01", type: "Meeting", personIds: ["n1", "n2", "gone"], event: "" }, { id: "i2", summary: "no date", date: null, type: "Note", personIds: [], event: "" }],
};

describe("Notion import", () => {
  it("copies people, links, promises and talks; dates lose the time part", async () => {
    const db = await testDb();
    const c = await importFromNotion(db, src);
    expect(c).toEqual({ people: 2, promises: 2, interactions: 1, links: 2 });
    const data = await loadFromDb(db, "2026-11-04");
    const neha = data.people.find((p) => p.name === "Neha Sharma")!;
    const ankit = data.people.find((p) => p.name === "Ankit Jain")!;
    expect(neha.lastContact).toBe("2026-11-01");
    expect(neha.knowsIds).toEqual([ankit.id]);
    expect(ankit.introducedById).toBe(neha.id);
    expect(data.owed.find((o) => o.what === "send deck")?.personId).toBe(neha.id);
    expect(data.interactions[0].personIds.sort()).toEqual([neha.id, ankit.id].sort());
  });

  it("running it twice adds nothing and keeps edits made in the app", async () => {
    const db = await testDb();
    await importFromNotion(db, src);
    await db.update(schema.people).set({ company: "Edited here" });
    const c = await importFromNotion(db, src);
    expect(c).toEqual({ people: 0, promises: 0, interactions: 0, links: 0 });
    expect((await db.select().from(schema.people)).every((p) => p.company === "Edited here")).toBe(true);
  });
});
