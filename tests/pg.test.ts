// Runs only when TEST_DATABASE_URL points at a real Postgres (same driver as Neon in production).
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { migrate, schema, type DB } from "@/db";
import { saveCapture, undo } from "@/capture/store";
import { loadFromDb } from "@/lib/data-db";
import type { Extracted } from "@/capture/extract";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("real Postgres with the production driver", () => {
  it("migrates, saves, reads dates as strings, undoes", async () => {
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema }) as unknown as DB;
    await db.execute(sql`drop schema public cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db);
    await migrate(db);
    const ex: Extracted = {
      people: [{ name: "Neha Sharma", company: "Razorpay", role: "", world: "", howMet: "", caresAbout: "AI pricing", personalNotes: "", ideasToHelp: "", commonGround: "", mutualContacts: "", linkedin: "", email: "", phone: "" }],
      summary: "Coffee", type: "Meeting", date: "2026-11-03", promises: [{ who: "me", person: "", what: "send deck", due: "" }],
      connections: [], question: "", transcript: "", followUpDraft: "",
    };
    const results = await Promise.all([saveCapture(db, ex, "Text", null, "2026-11-04"), saveCapture(db, ex, "Text", null, "2026-11-04")]);
    const data = await loadFromDb(db, "2026-11-04");
    expect(data.people.length).toBe(1); // the lock stops a duplicate
    expect(data.people[0].lastContact).toBe("2026-11-03");
    expect(typeof data.people[0].created).toBe("string");
    expect(data.owed[0]).toMatchObject({ who: "Me", due: "2026-11-06", done: false });
    expect(data.interactions.length).toBe(2);
    expect(await undo(db, results[0].id)).toBe(true);
    await pool.end();
  });
});
