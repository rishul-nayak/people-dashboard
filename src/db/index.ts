import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { MIGRATIONS } from "./migrations";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export { schema };

export function dbUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}
export const hasDb = () => !!dbUrl();

/** Apply any migration that has not run yet. Safe to call on every cold start. */
export async function migrate(db: DB): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(727201)`);
    await tx.execute(sql`create table if not exists _migrations (n int primary key, applied_at timestamptz not null default now())`);
    const done = await tx.execute(sql`select coalesce(max(n), 0) as n from _migrations`);
    const have = Number((done.rows[0] as { n: number | string }).n);
    for (let i = have; i < MIGRATIONS.length; i++) {
      // One statement per call: some drivers refuse several statements in one query.
      for (const stmt of MIGRATIONS[i].split(";").map((x) => x.trim()).filter(Boolean)) {
        await tx.execute(sql.raw(stmt));
      }
      await tx.execute(sql`insert into _migrations (n) values (${i + 1})`);
    }
  });
}

const g = globalThis as unknown as { __pdPool?: Pool; __pdReady?: Promise<DB> };

/** One database handle per server instance. Needs DATABASE_URL (Neon). */
export function getDb(): Promise<DB> {
  if (!g.__pdReady) {
    const url = dbUrl();
    if (!url) return Promise.reject(new Error("DATABASE_URL is not set"));
    g.__pdPool = new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
    const db = drizzle(g.__pdPool, { schema });
    g.__pdReady = migrate(db).then(() => db);
    g.__pdReady.catch(() => { g.__pdReady = undefined; });
  }
  return g.__pdReady;
}
