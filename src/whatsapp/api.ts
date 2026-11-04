// The small part that talks to Meta's WhatsApp Cloud API.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Reply } from "@/capture/engine";

const GRAPH = "https://graph.facebook.com/v23.0";

export type WaConfig = { token: string; phoneId: string };

export function waConfig(): WaConfig | null {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  return token && phoneId ? { token, phoneId } : null;
}

/** Digits only, with the India country code added to a bare 10-digit number. */
export function normNumber(n: string | undefined | null): string {
  const d = (n || "").replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d;
}

/** Meta signs every webhook with the app secret. Anything else is rejected. */
export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice(7);
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function post(cfg: WaConfig, body: object): Promise<any> {
  const res = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp send ${res.status}`);
  return res.json();
}

/** Sends one reply. Returns the WhatsApp message id so a later "reply to this card" can find it. */
export async function sendReply(cfg: WaConfig, to: string, r: Reply, replyTo?: string): Promise<string | undefined> {
  const context = replyTo ? { context: { message_id: replyTo } } : {};
  const body = r.buttons?.length
    ? {
        to, type: "interactive", ...context,
        interactive: {
          type: "button",
          body: { text: r.text.slice(0, 1024) },
          action: { buttons: r.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
        },
      }
    : { to, type: "text", ...context, text: { body: r.text.slice(0, 4000), preview_url: false } };
  const out = await post(cfg, body);
  return out?.messages?.[0]?.id;
}

/** Blue ticks and a typing dots while we work. Best effort: never breaks a capture. */
export async function markRead(cfg: WaConfig, messageId: string): Promise<void> {
  try {
    await post(cfg, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  } catch {
    /* ignore */
  }
}

export async function downloadMedia(cfg: WaConfig, mediaId: string): Promise<Buffer> {
  const auth = { Authorization: `Bearer ${cfg.token}` };
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, { headers: auth });
  if (!meta.ok) throw new Error(`WhatsApp media ${meta.status}`);
  const { url } = (await meta.json()) as { url: string };
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`WhatsApp media download ${file.status}`);
  return Buffer.from(await file.arrayBuffer());
}
