// Gemini turns a voice note, photo or text into people, one interaction, promises and links.
import { ApiError, GoogleGenAI } from "@google/genai";
import { CAPTURE, OWNER, WORLDS } from "@/lib/config";

export const TYPES = ["Meeting", "Call", "Event", "Message", "Note", "Contact card"] as const;
export type InteractionType = (typeof TYPES)[number];

export type PersonIn = {
  name: string; company: string; role: string; world: string; howMet: string; caresAbout: string;
  personalNotes: string; ideasToHelp: string; commonGround: string; mutualContacts: string;
  linkedin: string; email: string; phone: string;
};
export type PromiseIn = { who: "me" | "them"; person: string; what: string; due: string };
export type ConnectionIn = { person: string; other: string; kind: "knows" | "introduced_me" };
export type Extracted = {
  people: PersonIn[]; summary: string; type: InteractionType; date: string; promises: PromiseIn[];
  connections: ConnectionIn[]; question: string; transcript: string; followUpDraft: string;
};
export type Media = { data: Buffer; mime: string };
export type ExtractInput = { text: string; media: Media[]; today: string; event: string | null };
export type ExtractFn = (input: ExtractInput) => Promise<Extracted>;

export class QuotaExhausted extends Error {}
export class ExtractError extends Error {}

const str = { type: "string" };
const PERSON_SCHEMA = {
  type: "object",
  properties: {
    name: str, company: str, role: str, world: str, how_met: str, cares_about: str, personal_notes: str,
    ideas_to_help: str, common_ground: str, mutual_contacts: str, linkedin_url: str, email: str, phone: str,
  },
  required: ["name"],
};
const SCHEMA = {
  type: "object",
  properties: {
    people: { type: "array", items: PERSON_SCHEMA },
    summary: str,
    type: { type: "string", enum: [...TYPES] },
    date: str,
    promises: {
      type: "array",
      items: {
        type: "object",
        properties: { who: { type: "string", enum: ["me", "them"] }, person: str, what: str, due: str },
        required: ["who", "what"],
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        properties: { person: str, other: str, kind: { type: "string", enum: ["knows", "introduced_me"] } },
        required: ["person", "other", "kind"],
      },
    },
    question: str,
    transcript: str,
    follow_up_draft: str,
  },
  required: ["people", "summary", "type", "promises"],
};

const PROMPT = `You keep {owner}'s personal network notes. {owner} sends you a voice note, a photo (visiting card,
profile screenshot) or text about people he met or talked to. Today is {today} ({weekday}).{event}

How {owner} networks: be useful first, keep every promise, follow up within 24 hours, and remember
what matters most to people (their goals, problems, health, wealth, children).

Return JSON:
- people: everyone he met or talked about as a contact. Never include {owner} himself.
  Fill a field only if the input says it. Never guess a company, role, email or phone.
  world: one of {worlds}.
  how_met: where or through whom they met, in a few words.
  cares_about: their goals, problems, what they are working on.
  personal_notes: family, hobbies, hometown, life events. Write respectfully, as if they might read it.
  common_ground: rare things they share with {owner} (his links: {links}). Only if said.
  mutual_contacts: people they both know, or who introduced them. Only if said.
  ideas_to_help: up to 2 small, useful things {owner} could do for them (an intro, an article, feedback,
    a five-minute favour) that follow from what was said. Never invent facts. One sentence each.
- connections: links between two people, only if the input says so.
  kind "knows": person and other know each other.
  kind "introduced_me": other introduced person to {owner}. Use full names as said.
- summary: one plain line about this interaction, e.g. "Coffee at Third Wave, talked about AI pricing".
- type: Meeting, Call, Event, Message, Note, or Contact card (just a card or profile, no conversation).
- date: YYYY-MM-DD of the interaction. "yesterday" means the day before today. Empty if not said.
- promises: things {owner} promised ("who": "me") or they promised him ("who": "them").
  person = that contact's name. due = YYYY-MM-DD if a time was said ("by Friday"), else empty.
- question: if a key fact is missing (a full name, or how they met), ONE short question to ask {owner}. Else empty.
- transcript: for a voice note, what he said, word for word. Empty for text and photos.
- follow_up_draft: if he met or talked to someone new or important, his 24-hour follow-up message to the
  main person, ending "— {owner}". Empty for a contact card, a forwarded message or a plain note.
Writing rules for every text you write (notes, summary, ideas, the draft):
- Normal sentences, the way he would say them to a friend. No clever, poetic or salesy phrases,
  no buzzwords, no filler ("great to connect", "hope you're doing well"), no emoji.
- Keep every concrete detail: names, companies, roles, numbers, dates, places.
- Short: 1 to 2 sentences per field. Say each thing once. Never repeat the summary in a note.
- The draft: thank them for one specific thing, deliver or restate the promise with its date,
  end with one clear next step. 3 to 4 short sentences.
He may speak English or Hinglish. Write the output in English.`;

export function buildPrompt(today: string, event: string | null): string {
  const weekday = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return PROMPT.replaceAll("{owner}", OWNER.name)
    .replace("{today}", today)
    .replace("{weekday}", weekday)
    .replace("{worlds}", WORLDS.join(", "))
    .replace("{links}", OWNER.links.join(", "))
    .replace("{event}", event ? `\nHe is at this event right now: ${event}.` : "");
}

// ---------------- cleaning Gemini's answer (pure, tested) ----------------
const s = (x: unknown, n = 1900): string => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const iso = (x: unknown): string => {
  const v = s(x, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  const d = new Date(v + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "" : v;
};

export function normalise(data: any, today: string): Extracted {
  const owner = OWNER.name.toLowerCase();
  const isOwner = (n: string) => {
    const l = n.toLowerCase();
    return l === owner || l === "me" || l === "i" || l === "myself";
  };
  const people: PersonIn[] = [];
  for (const p of Array.isArray(data?.people) ? data.people : []) {
    const name = s(p?.name, 100);
    if (!name || isOwner(name)) continue;
    const world = s(p.world);
    const linkedin = s(p.linkedin_url);
    const email = s(p.email);
    people.push({
      name,
      company: s(p.company), role: s(p.role),
      world: WORLDS.includes(world) ? world : "",
      howMet: s(p.how_met), caresAbout: s(p.cares_about), personalNotes: s(p.personal_notes),
      ideasToHelp: s(p.ideas_to_help), commonGround: s(p.common_ground), mutualContacts: s(p.mutual_contacts),
      linkedin: linkedin.includes("linkedin.com") ? linkedin : "",
      email: email.includes("@") ? email : "",
      phone: s(p.phone),
    });
  }
  const promises: PromiseIn[] = [];
  for (const pr of Array.isArray(data?.promises) ? data.promises : []) {
    const what = s(pr?.what, 300);
    if (what && (pr.who === "me" || pr.who === "them")) promises.push({ who: pr.who, person: s(pr.person, 100), what, due: iso(pr.due) });
  }
  const connections: ConnectionIn[] = [];
  for (const c of Array.isArray(data?.connections) ? data.connections : []) {
    const person = s(c?.person, 100);
    const other = s(c?.other, 100);
    if (!person || !other || isOwner(person) || isOwner(other) || person.toLowerCase() === other.toLowerCase()) continue;
    if (c.kind === "knows" || c.kind === "introduced_me") connections.push({ person, other, kind: c.kind });
  }
  let date = iso(data?.date) || today;
  if (date > today) date = today;
  return {
    people,
    summary: s(data?.summary, 300) || "Note",
    type: (TYPES as readonly string[]).includes(data?.type) ? data.type : "Note",
    date,
    promises,
    connections,
    question: s(data?.question, 200),
    transcript: s(data?.transcript, 5000),
    followUpDraft: String(data?.follow_up_draft ?? "").trim().slice(0, 1000),
  };
}

// ---------------- the call ----------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function geminiExtractor(apiKey: string): ExtractFn {
  const ai = new GoogleGenAI({ apiKey });

  async function call(model: string, input: ExtractInput): Promise<string> {
    const parts: any[] = input.media.map((m) => ({ inlineData: { data: m.data.toString("base64"), mimeType: m.mime } }));
    parts.push({ text: input.text || "(no text, see the attachment)" });
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const resp = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: buildPrompt(input.today, input.event),
            responseMimeType: "application/json",
            responseJsonSchema: SCHEMA,
            temperature: 0.1,
          },
        });
        if (!resp.text) throw new ExtractError("empty response");
        return resp.text;
      } catch (e) {
        if (e instanceof ExtractError) throw e;
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 429) throw new QuotaExhausted("Gemini quota used up");
        if (status >= 500 && attempt < 2) {
          await sleep(3000 * (attempt + 1));
          continue;
        }
        throw new ExtractError(`Gemini ${status || "network error"}`);
      }
    }
    throw new ExtractError("Gemini failed");
  }

  return async (input) => {
    let raw: string;
    try {
      raw = await call(CAPTURE.models.main, input);
    } catch (e) {
      if (e instanceof QuotaExhausted) throw e;
      raw = await call(CAPTURE.models.fallback, input);
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ExtractError("Gemini returned invalid JSON");
    }
    return normalise(data, input.today);
  };
}
