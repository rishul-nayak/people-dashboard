import { NextResponse } from "next/server";
import { getDb, hasDb, type DB } from "@/db";
import { BadInput } from "./mutations";

/** Runs a write handler: same-site check, database, and clean error answers. */
export async function api(req: Request, run: (db: DB, body: any) => Promise<unknown>): Promise<Response> {
  // The passcode cookie is the login. This also stops other websites from posting to us.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Wrong origin" }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ error: "DATABASE_URL is not set" }, { status: 503 });
  let body: any = {};
  if (req.method !== "GET" && req.method !== "DELETE") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Send JSON" }, { status: 400 });
    }
  }
  try {
    const out = await run(await getDb(), body);
    if (out === null || out === false) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, result: out === true ? undefined : out });
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("api failed:", e instanceof Error ? e.name : "error");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
