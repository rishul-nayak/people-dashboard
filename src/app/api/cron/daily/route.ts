import { retryPending } from "@/capture/engine";
import { geminiExtractor } from "@/capture/extract";
import { getDb } from "@/db";
import { downloadMedia, normNumber, sendReply, waConfig } from "@/whatsapp/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel calls this once a day (see vercel.json) with "Authorization: Bearer CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET is not set", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });

  const cfg = waConfig();
  const gemini = process.env.GEMINI_API_KEY;
  if (!cfg || !gemini) return Response.json({ ok: false, reason: "WhatsApp or Gemini is not set up" });

  const db = await getDb();
  const replies = await retryPending({ db, extract: geminiExtractor(gemini), fetchMedia: (id) => downloadMedia(cfg, id) });
  let sent = 0;
  const owner = process.env.WHATSAPP_OWNER ? normNumber(process.env.WHATSAPP_OWNER) : null;
  if (owner) {
    for (const r of replies) {
      try {
        await sendReply(cfg, owner, r);
        sent++;
      } catch {
        // outside the 24-hour window WhatsApp refuses a free message. The note is still saved in the dashboard.
      }
    }
  }
  return Response.json({ ok: true, retried: replies.length, sent });
}
