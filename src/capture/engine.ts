// The brain: one incoming note, command or button press from the owner -> database changes + replies.
// It knows nothing about WhatsApp. The webhook gives it text and media, and sends what it returns.
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { CAPTURE } from "@/lib/config";
import { loadFromDb } from "@/lib/data-db";
import { openOwed, pingToday } from "@/lib/today";
import { niceDate, todayIso } from "@/lib/util";
import { ExtractError, QuotaExhausted, type ExtractFn } from "./extract";
import {
  bumpPending, findPeopleByName, getCard, keepSeparate, lastSaved, markInteraction, merge, pendingRows,
  saveCapture, savePending, undo, type Card, type Payload,
} from "./store";

export type Button = { id: string; title: string };
export type Reply = { text: string; buttons?: Button[]; interactionId?: string };

export type Deps = {
  db: DB;
  extract: ExtractFn;
  fetchMedia: (mediaId: string) => Promise<Buffer>;
  today?: () => string;
  now?: () => Date;
};
const today = (d: Deps) => (d.today ? d.today() : todayIso());
const now = (d: Deps) => (d.now ? d.now() : new Date());

export const HELP = `*People Inbox*
Send a note about anyone you meet:
- a voice note: who, where, what they care about, what you promised
- a photo of a visiting card or a profile screenshot
- text, or a forwarded message
Reply to one of my cards to add to it.

*today* shows who to message and what you owe.
*who Neha* shows what you know about Neha.
*promises* lists open promises.
*event AI meetup* tags your notes with the event for ${CAPTURE.eventHours} hours. *event off* stops it.
*undo* removes the last saved note.`;

// ---------- formatting (WhatsApp: *bold*, no emoji) ----------
export function cardText(c: Card): string {
  const lines = [`*Saved* · ${c.type} · ${niceDate(c.date)}${c.event ? ` · ${c.event}` : ""}`];
  const maybe = new Map(c.maybe.map((m) => [m.k, m]));
  c.people.forEach((p, k) => {
    const next = p.next ? ` Next contact ${niceDate(p.next)}.` : "";
    const m = maybe.get(k);
    const status = m ? `new contact. Is this ${m.names.join(" or ")}?` : p.status === "new" ? `new contact, ${p.tier || ""}.${next}` : `updated.${next}`;
    lines.push(`*${p.name}*: ${status}`);
  });
  for (const p of c.people.slice(0, 3)) if (p.idea) lines.push(`*Idea for ${p.name}:* ${p.idea}`);
  for (const pr of c.promises) {
    lines.push(pr.who === "me"
      ? `*You owe ${pr.person || "them"}:* ${pr.what}, by ${niceDate(pr.due)}.`
      : `*${pr.person || "They"} owe you:* ${pr.what}. Check on ${niceDate(pr.due)}.`);
  }
  for (const l of c.links) lines.push(l.text);
  if (c.question) lines.push(`*Question:* ${c.question} Reply to this message.`);
  lines.push("Reply *undo* to remove this note.");
  return lines.join("\n");
}

function cardReplies(c: Card): Reply[] {
  const out: Reply[] = [{ text: cardText(c), interactionId: c.id }];
  if (c.draft) out.push({ text: c.draft, interactionId: c.id }); // alone in its own message: easy to copy and send
  const m = c.maybe[0];
  if (m) {
    const iid = c.id.replace(/-/g, "");
    const buttons: Button[] = m.names.slice(0, 2).map((n, j) => ({ id: `m:${iid}:${m.k}:${j}`, title: `Same as ${n}`.slice(0, 20) }));
    buttons.push({ id: `k:${iid}:${m.k}`, title: "Keep separate" });
    out.push({ text: `Is ${c.people[m.k].name} the same person as ${m.names.join(" or ")}?`, buttons, interactionId: c.id });
  }
  return out;
}

const uuid = (s: string) => {
  const h = s.replace(/-/g, "");
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : s;
};

// ---------- capture ----------
export type Outcome = { kind: "saved" | "pending" | "none"; replies: Reply[] };

export async function capture(d: Deps, payload: Payload, pendingId?: string): Promise<Outcome> {
  const media = payload.mediaId ? [{ data: await d.fetchMedia(payload.mediaId), mime: payload.mime || "audio/ogg" }] : [];
  let text = payload.text;
  if (payload.context) text = `He is replying to this earlier note from you, so it is about the same people:\n${payload.context}\n\nHis reply:\n${text}`;
  const event = await currentEvent(d);
  let ex;
  try {
    ex = await d.extract({ text, media, today: today(d), event });
  } catch (e) {
    if (!(e instanceof QuotaExhausted || e instanceof ExtractError)) throw e;
    if (pendingId) throw e;
    await savePending(d.db, payload, today(d), e.constructor.name);
    return { kind: "pending", replies: [{ text: "Got it. Gemini is busy, so I will save this on the next try." }] };
  }
  if (!ex.people.length) {
    if (pendingId) await markInteraction(d.db, pendingId, "Error");
    return { kind: "none", replies: [{ text: "I could not find a person in this. Say their full name, for example: Met Neha Sharma from Razorpay at the AI meetup." }] };
  }
  const card = await saveCapture(d.db, ex, payload.source, event, today(d), pendingId);
  return { kind: "saved", replies: cardReplies(card) };
}

/** Notes Gemini could not read earlier. Runs after each message and once a day. */
export async function retryPending(d: Deps, skip: Set<string> = new Set()): Promise<Reply[]> {
  const out: Reply[] = [];
  for (const row of (await pendingRows(d.db)).filter((r) => !skip.has(r.id))) {
    const data = row.data as { payload: Payload; tries?: number };
    try {
      out.push(...(await capture(d, data.payload, row.id)).replies);
    } catch (e) {
      if (!(e instanceof QuotaExhausted || e instanceof ExtractError)) throw e;
      const giveUp = (data.tries || 0) + 1 >= CAPTURE.pendingMaxTries;
      await bumpPending(d.db, row.id, giveUp);
      if (giveUp) out.push({ text: "I could not process one note after 3 tries. It is in your dashboard history with status Error. Please send it again." });
      break; // Gemini is still busy: try again later
    }
  }
  return out;
}

// ---------- event mode ----------
async function currentEvent(d: Deps): Promise<string | null> {
  const [row] = await d.db.select().from(schema.settings).where(eq(schema.settings.key, "event"));
  const v = row?.value as { name: string; until: string } | undefined;
  return v && new Date(v.until) > now(d) ? v.name : null;
}

// ---------- buttons ----------
export async function onButton(d: Deps, id: string): Promise<Reply[]> {
  const [action, rawId, a, b] = id.split(":");
  const iid = uuid(rawId || "");
  if (action === "m") {
    const c = await merge(d.db, iid, Number(a), Number(b));
    return c ? [{ text: cardText(c) }] : [];
  }
  if (action === "k") {
    const c = await keepSeparate(d.db, iid, Number(a));
    return c ? [{ text: "Kept as a separate person." }] : [];
  }
  return [];
}

// ---------- commands ----------
export async function handleText(d: Deps, text: string, extra: { source: string; context?: string; mediaId?: string; mime?: string }): Promise<Outcome | { kind: "command"; replies: Reply[] }> {
  const t = text.trim();
  if (!extra.mediaId) {
    const cmd = command(t);
    if (cmd) return { kind: "command", replies: await cmd(d) };
  }
  if (!t && !extra.mediaId) return { kind: "command", replies: [{ text: "Send me a voice note, a photo or text." }] };
  return capture(d, { text: t, source: extra.source, mediaId: extra.mediaId, mime: extra.mime, context: extra.context });
}

function command(t: string): ((d: Deps) => Promise<Reply[]>) | null {
  const m = /^\/?(help|hi|hello|start|today|promises|undo|who|event)\b\s*([\s\S]*)$/i.exec(t);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim();
  // "Today I met Neha" or "Hi Neha, ..." is a note, not a command: these words are commands only when alone
  if (arg && !["who", "event"].includes(cmd)) return null;
  if (cmd === "who" && !arg) return async () => [{ text: "Usage: who Neha" }];
  // a long "Event at Third Wave, met Neha ..." is a note
  if (cmd === "event" && arg && !/^(off|stop|end)$/i.test(arg) && arg.split(/\s+/).length > 6) return null;
  if (["hi", "hello", "start", "help"].includes(cmd)) return async () => [{ text: HELP }];
  if (cmd === "today") return today_;
  if (cmd === "promises") return promises_;
  if (cmd === "undo") return undo_;
  if (cmd === "who") return async (d) => [{ text: arg ? await who_(d, arg) : "Usage: who Neha" }];
  return (d) => event_(d, arg);
}

async function undo_(d: Deps): Promise<Reply[]> {
  const id = await lastSaved(d.db);
  if (!id) return [{ text: "Nothing to undo." }];
  const ok = await undo(d.db, id);
  return [{ text: ok ? "Undone. Nothing from your last note is saved now." : "Already undone." }];
}

async function event_(d: Deps, arg: string): Promise<Reply[]> {
  if (!arg || /^(off|stop|end)$/i.test(arg)) {
    await d.db.delete(schema.settings).where(eq(schema.settings.key, "event"));
    return [{ text: "Event mode is off." }];
  }
  const until = new Date(now(d).getTime() + CAPTURE.eventHours * 3_600_000).toISOString();
  const value = { name: arg.slice(0, 80), until };
  await d.db.insert(schema.settings).values({ key: "event", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return [{ text: `Event mode is on for ${CAPTURE.eventHours} hours: *${value.name}*. Every note you send gets this tag.` }];
}

const late = (due: string | null, t: string) => {
  if (!due || due >= t) return "";
  const n = Math.round((Date.parse(t) - Date.parse(due)) / 86_400_000);
  return ` (${n} day${n > 1 ? "s" : ""} late)`;
};

async function today_(d: Deps): Promise<Reply[]> {
  const data = await loadFromDb(d.db, today(d));
  const pings = pingToday(data.people, data.today).slice(0, 5);
  const owed = openOwed(data.owed, data.people, data.today).filter((o) => o.item.who === "Me").slice(0, 5);
  const lines = ["*Message these people today*"];
  if (!pings.length) lines.push("No one is due.");
  for (const p of pings) lines.push(`- ${p.person.name} (${p.person.tier}): ${p.reason}${p.late > 0 ? `, ${p.late} day${p.late > 1 ? "s" : ""} late` : ""}`);
  lines.push("", "*You owe*");
  if (!owed.length) lines.push("Nothing open.");
  for (const o of owed) lines.push(`- ${o.person?.name || "Someone"}: ${o.item.what}, by ${niceDate(o.item.due)}${late(o.item.due, data.today)}`);
  return [{ text: lines.join("\n") }];
}

async function promises_(d: Deps): Promise<Reply[]> {
  const data = await loadFromDb(d.db, today(d));
  const rows = openOwed(data.owed, data.people, data.today);
  if (!rows.length) return [{ text: "No open promises." }];
  const out: string[] = [];
  for (const [who, title] of [["Me", "*You owe*"], ["Them", "*They owe you*"]] as const) {
    const mine = rows.filter((r) => r.item.who === who).slice(0, 15);
    if (!mine.length) continue;
    out.push(title);
    for (const r of mine) out.push(`- ${r.person?.name || "—"}: ${r.item.what}, by ${niceDate(r.item.due)}${late(r.item.due, data.today)}`);
  }
  return [{ text: out.join("\n") }];
}

async function who_(d: Deps, q: string): Promise<string> {
  const hits = await findPeopleByName(d.db, q);
  if (!hits.length) return `No one called ${q} yet.`;
  const data = await loadFromDb(d.db, today(d));
  const out: string[] = [];
  for (const p of hits) {
    const job = [p.role, p.company].filter(Boolean).join(" · ");
    const lines = [`*${p.name}* · ${p.tier || "No tier"}${job ? ` · ${job}` : ""}`, `Last contact ${p.lastContact ? niceDate(p.lastContact) : "none"}. Next contact ${p.nextContact ? niceDate(p.nextContact) : "none"}.`];
    for (const [label, v] of [["Cares about", p.caresAbout], ["Personal", p.personalNotes], ["How you met", p.howMet], ["Common ground", p.commonGround], ["Mutual contacts", p.mutualContacts], ["Ideas to help", p.ideasToHelp]] as const) {
      if (v) lines.push(`*${label}:* ${v.slice(-400)}`);
    }
    for (const o of data.owed.filter((x) => !x.done && x.personId === p.id)) lines.push(`*${o.who === "Me" ? "You owe" : "They owe you"}:* ${o.what}, by ${niceDate(o.due)}.`);
    out.push(lines.join("\n"));
  }
  return out.join("\n\n");
}

export { getCard };
