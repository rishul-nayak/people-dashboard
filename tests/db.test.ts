import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { testDb } from "./helpers";

describe("database", () => {
  it("migrates and stores a person with dates as plain strings", async () => {
    const db = await testDb();
    const [p] = await db.insert(schema.people).values({ name: "Neha Sharma", lastContact: "2026-11-04" }).returning();
    expect(p.tier).toBe("Tier 1");
    expect(p.lastContact).toBe("2026-11-04");
    expect(p.company).toBe("");
  });

  it("migrating twice changes nothing", async () => {
    const db = await testDb();
    const { migrate } = await import("@/db");
    await migrate(db);
    await db.insert(schema.people).values({ name: "A" });
    await migrate(db);
    expect((await db.select().from(schema.people)).length).toBe(1);
  });

  it("deleting a person removes links and keeps the promise", async () => {
    const db = await testDb();
    const [a] = await db.insert(schema.people).values({ name: "A" }).returning();
    const [b] = await db.insert(schema.people).values({ name: "B" }).returning();
    await db.insert(schema.edges).values({ aId: a.id, bId: b.id });
    const [pr] = await db.insert(schema.promises).values({ what: "send deck", personId: a.id }).returning();
    await db.delete(schema.people).where(eq(schema.people.id, a.id));
    expect((await db.select().from(schema.edges)).length).toBe(0);
    const [left] = await db.select().from(schema.promises).where(eq(schema.promises.id, pr.id));
    expect(left.personId).toBeNull();
  });

  it("rejects an edge from a person to themselves", async () => {
    const db = await testDb();
    const [a] = await db.insert(schema.people).values({ name: "A" }).returning();
    await expect(db.insert(schema.edges).values({ aId: a.id, bId: a.id })).rejects.toThrow();
  });
});
