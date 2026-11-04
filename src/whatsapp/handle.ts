// One message from WhatsApp, start to finish: who sent it, is it new, what does it say, what do we answer.
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { HELP, handleText, onButton, retryPending, type Deps, type Reply } from "@/capture/engine";
import { normNumber } from "./api";
import type { Incoming } from "./parse";

export type Send = (to: string, reply: Reply, replyTo?: string) => Promise<string | undefined>;
export type Ctx = { deps: Deps; owner: string | null; send: Send; markRead?: (id: string) => Promise<void>; log?: (msg: string) => void };

async function deliver(c: Ctx, to: string, replies: Reply[], replyTo?: string) {
  for (const r of replies) {
    const id = await c.send(to, r, replyTo);
    if (id) {
      // remember what we sent, so "reply to this card" can add to the same people
      await c.deps.db.insert(schema.waMessages).values({ id, direction: "out", body: r.text.slice(0, 3000), interactionId: r.interactionId ?? null }).onConflictDoNothing();
    }
  }
}

export async function handleIncoming(c: Ctx, m: Incoming): Promise<void> {
  const db = c.deps.db;
  const fresh = await db.insert(schema.waMessages).values({ id: m.id, direction: "in" }).onConflictDoNothing().returning({ id: schema.waMessages.id });
  if (!fresh.length) return; // Meta sent it twice

  if (!c.owner) {
    await c.send(m.from, { text: `Your WhatsApp number is ${m.from}. Add it as WHATSAPP_OWNER in the Vercel settings, redeploy, then send me a note.` });
    return;
  }
  if (normNumber(m.from) !== normNumber(c.owner)) return; // strangers get no reply

  try {
    await c.markRead?.(m.id);
    if (m.kind === "button") {
      if (m.buttonId) await deliver(c, m.from, await onButton(c.deps, m.buttonId));
      return;
    }
    if (m.kind === "other") {
      await deliver(c, m.from, [{ text: "Send me a voice note, a photo or text." }], m.id);
      return;
    }
    let context = "";
    if (m.contextId) {
      const [row] = await db.select().from(schema.waMessages).where(and(eq(schema.waMessages.id, m.contextId), eq(schema.waMessages.direction, "out")));
      context = row?.body.slice(0, 1500) || "";
    }
    const text = m.forwarded ? `(Forwarded message)\n${m.text}` : m.text;
    const source = m.forwarded ? "Forward" : m.kind === "voice" ? "Voice" : m.kind === "photo" ? "Photo" : "Text";
    const out = await handleText(c.deps, text, { source, context, mediaId: m.mediaId, mime: m.mime });
    await deliver(c, m.from, out.replies, m.id);
    if (out.kind !== "pending") await deliver(c, m.from, await retryPending(c.deps));
  } catch (e) {
    c.log?.(`message failed: ${e instanceof Error ? e.name : "error"}`);
    await c.send(m.from, { text: `Could not save that (${e instanceof Error ? e.name : "error"}). Please send it again.` }, m.id).catch(() => {});
  }
}

export { HELP };
