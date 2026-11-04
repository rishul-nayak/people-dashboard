import { describe, expect, it } from "vitest";
import { schema } from "@/db";
import { BadInput, cleanPerson, createPerson, createPromise, deletePerson, setPromiseDone, touchPerson, updatePerson } from "@/lib/mutations";
import { testDb } from "./helpers";

const T = "2026-11-04";

describe("hand edits", () => {
  it("adds a person; next contact follows the tier", async () => {
    const db = await testDb();
    const p = await createPerson(db, { name: "  Neha   Sharma ", tier: "Ally", company: "Razorpay" }, T);
    expect(p).toMatchObject({ name: "Neha Sharma", tier: "Ally", nextContact: "2026-11-25", company: "Razorpay" });
    const q = await createPerson(db, { name: "Mom", tier: "Inner circle" }, T);
    expect(q.nextContact).toBeNull();
  });

  it("rejects bad input", async () => {
    const db = await testDb();
    await expect(createPerson(db, { name: "" }, T)).rejects.toBeInstanceOf(BadInput);
    await expect(createPerson(db, { name: "A", tier: "Gold" }, T)).rejects.toBeInstanceOf(BadInput);
    await expect(createPerson(db, { name: "A", world: "Mars" }, T)).rejects.toBeInstanceOf(BadInput);
    await expect(createPerson(db, { name: "A", email: "nope" }, T)).rejects.toBeInstanceOf(BadInput);
    await expect(createPerson(db, { name: "A", nextContact: "tomorrow" }, T)).rejects.toBeInstanceOf(BadInput);
    expect(() => cleanPerson(null, { requireName: true })).toThrow(BadInput);
  });

  it("ignores fields it does not know, so nobody can write the id or legacy id", () => {
    const v = cleanPerson({ name: "A", id: "x", legacyId: "y", createdAt: "z", isAdmin: true }, { requireName: true });
    expect(Object.keys(v)).toEqual(["name"]);
  });

  it("changing the tier moves the next contact from the last contact", async () => {
    const db = await testDb();
    const p = await createPerson(db, { name: "A", tier: "Tier 1", lastContact: "2026-11-01" }, T);
    expect(p.nextContact).toBe("2026-12-01");
    const u = await updatePerson(db, p.id, { tier: "Ally" }, T);
    expect(u?.nextContact).toBe("2026-11-22");
    const d = await updatePerson(db, p.id, { tier: "Inner circle" }, T);
    expect(d?.nextContact).toBeNull();
    const manual = await updatePerson(db, p.id, { tier: "Tier 2", nextContact: "2027-01-01" }, T);
    expect(manual?.nextContact).toBe("2027-01-01");
    expect(await updatePerson(db, "00000000-0000-0000-0000-000000000000", { company: "x" }, T)).toBeNull();
    await expect(updatePerson(db, p.id, {}, T)).rejects.toBeInstanceOf(BadInput);
  });

  it("'I messaged them' sets last and next contact and logs it", async () => {
    const db = await testDb();
    const p = await createPerson(db, { name: "A", tier: "Tier 1" }, T);
    const u = await touchPerson(db, p.id, "Sent the deck", T);
    expect(u).toMatchObject({ lastContact: T, nextContact: "2026-12-04" });
    const [i] = await db.select().from(schema.interactions);
    expect(i).toMatchObject({ summary: "Sent the deck", type: "Message", source: "Manual" });
    expect((await db.select().from(schema.interactionPeople)).length).toBe(1);
  });

  it("promises: add, tick, untick, and the person can be deleted without losing the promise", async () => {
    const db = await testDb();
    const p = await createPerson(db, { name: "A" }, T);
    const pr = await createPromise(db, { what: "send deck", who: "Me", personId: p.id }, T);
    expect(pr.due).toBe("2026-11-06");
    expect(await setPromiseDone(db, pr.id, true)).toBe(true);
    expect((await db.select().from(schema.promises))[0].done).toBe(true);
    expect(await setPromiseDone(db, "00000000-0000-0000-0000-000000000000", true)).toBe(false);
    expect(await deletePerson(db, p.id)).toBe(true);
    expect((await db.select().from(schema.promises)).length).toBe(1);
    await expect(createPromise(db, { what: " " }, T)).rejects.toBeInstanceOf(BadInput);
  });
});
