import { after } from "next/server";
import { geminiExtractor } from "@/capture/extract";
import { getDb } from "@/db";
import { downloadMedia, markRead, normNumber, sendReply, verifySignature, waConfig } from "@/whatsapp/api";
import { handleIncoming, type Ctx } from "@/whatsapp/handle";
import { parseWebhook } from "@/whatsapp/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Meta calls this once, when you press "Verify and save" on the webhook page.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Meta calls this for every message. Answer fast, then do the work after the response.
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("WHATSAPP_APP_SECRET is not set", { status: 503 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) return new Response("Bad signature", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const messages = parseWebhook(body);
  if (!messages.length) return new Response("ok");

  after(async () => {
    const cfg = waConfig();
    const gemini = process.env.GEMINI_API_KEY;
    if (!cfg || !gemini) {
      console.error("missing WHATSAPP_TOKEN, WHATSAPP_PHONE_ID or GEMINI_API_KEY");
      return;
    }
    const db = await getDb();
    const ctx: Ctx = {
      deps: { db, extract: geminiExtractor(gemini), fetchMedia: (id) => downloadMedia(cfg, id) },
      owner: process.env.WHATSAPP_OWNER ? normNumber(process.env.WHATSAPP_OWNER) : null,
      send: (to, reply, replyTo) => sendReply(cfg, to, reply, replyTo),
      markRead: (id) => markRead(cfg, id),
      log: (m) => console.error(m), // error types only, never people's data
    };
    for (const m of messages) await handleIncoming(ctx, m); // in order
  });
  return new Response("ok");
}
