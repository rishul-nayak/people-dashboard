import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate, schema, type DB } from "@/db";

/** A fresh in-memory Postgres for one test. Same SQL and same schema as production. */
export async function testDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db);
  return db;
}
