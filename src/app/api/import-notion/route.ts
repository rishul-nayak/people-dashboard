import { NextResponse } from "next/server";
import { api } from "@/lib/http";
import { importFromNotion } from "@/lib/import-notion";
import { readNotion } from "@/lib/notion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Press "Import from Notion" in the dashboard. Copies your Notion people, promises and talks. Safe to press twice.
export const POST = (req: Request) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return Promise.resolve(NextResponse.json({ error: "NOTION_TOKEN is not set" }, { status: 503 }));
  return api(req, async (db) => importFromNotion(db, await readNotion(token)));
};
