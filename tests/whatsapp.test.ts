import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import type { Deps, Reply } from "@/capture/engine";
import type { Extracted } from "@/capture/extract";
import { normNumber, verifySignature } from "@/whatsapp/api";
import { handleIncoming, type Ctx } from "@/whatsapp/handle";
import { parseWebhook, type Incoming } from "@/whatsapp/parse";
import { testDb } from "./helpers";


describe("webhook parsing", () => {
  it("reads text, voice, photo, forward, contact card, button and unknown types", () => {
    const body = {
      entry: [{ changes: [{ value: { statuses: [{ id: "s1" }], messages: [
        { id: "1", from: "919876543210", type: "text", text: { body: "Met Neha" } },
        { id: "2", from: "919876543210", type: "audio", audio: { id: "A1", mime_type: "audio/ogg; codecs=opus" } },
        { id: "3", from: "919876543210", type: "image", image: { id: "I1", mime_type: "image/jpeg", caption: "card" } },
        { id: "4", from: "919876543210", type: "text", text: { body: "fwd" }, context: { forwarded: true } },
        { id: "5", from: "919876543210", type: "contacts", contacts: [{ name: { formatted_name: "Neha Sharma" }, org: { company: "Razorpay" }, phones: [{ phone: "+91 98765 11111" }] }] },
        { id: "6", from: "919876543210", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "k:abc:0", title: "Keep separate" } } },
        { id: "7", from: "919876543210", type: "sticker" },
        { id: "8", from: "919876543210", type: "text", text: { body: "reply" }, context: { id: "wamid.OUT" } },
      ] } }] }],
    };
    const m = parseWebhook(body);
    expect(m.map((x) => x.kind)).toEqual(["text", "voice", "photo", "text", "contact", "button", "other", "text"]);
    expect(m[1]).toMatchObject({ mediaId: "A1", mime: "audio/ogg" }); // codec part removed
    expect(m[2].text).toBe("card");
    expect(m[3].forwarded).toBe(true);
    expect(m[4].text).toBe("Contact card: Neha Sharma, company Razorpay, phone +91 98765 11111");
    expect(m[5].buttonId).toBe("k:abc:0");
    expect(m[7].contextId).toBe("wamid.OUT");
  });
  it("ignores status-only and garbage payloads", () => {
    expect(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: "x" })).toEqual([]);
  });
});

describe("signature and numbers", () => {
  it("accepts only Meta's signature", () => {
    const raw = '{"a":1}';
    const good = "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
    expect(verifySignature(raw, good, "secret")).toBe(true);
    expect(verifySignature(raw, good, "other")).toBe(false);
    expect(verifySignature(raw + " ", good, "secret")).toBe(false);
    expect(verifySignature(raw, null, "secret")).toBe(false);
    expect(verifySignature(raw, "sha256=short", "secret")).toBe(false);
    expect(verifySignature(raw, "md5=" + good.slice(7), "secret")).toBe(false);
  });
  it("normalises numbers", () => {
    expect(normNumber("+91 98765 43210")).toBe("919876543210");
    expect(normNumber("9876543210")).toBe("919876543210");
    expect(normNumber("919876543210")).toBe("919876543210");
    expect(normNumber(undefined)).toBe("");
  });
});

const result: Extracted = {
  people: [{ name: "Neha Sharma", company: "Razorpay", role: "", world: "", howMet: "", caresAbout: "AI pricing", personalNotes: "", ideasToHelp: "", commonGround: "", mutualContacts: "", linkedin: "", email: "", phone: "" }],
  summary: "Coffee", type: "Meeting", date: "2026-11-03", promises: [], connections: [], question: "", transcript: "", followUpDraft: "",
};

async function setup(owner: string | null, extract: Deps["extract"] = async () => result) {
  const db = await testDb();
  const sent: { to: string; r: Reply; replyTo?: string }[] = [];
  let n = 0;
  const ctx: Ctx = {
    deps: { db, extract, fetchMedia: async () => Buffer.from("x"), today: () => "2026-11-04", now: () => new Date("2026-11-04T10:00:00Z") },
    owner,
    send: async (to, r, replyTo) => { sent.push({ to, r, replyTo }); return "wamid.OUT" + ++n; },
  };
  return { db, sent, ctx };
}
const msg = (over: Partial<Incoming> = {}): Incoming => ({ id: "wamid.IN1", from: "919876543210", kind: "text", text: "Met Neha", ...over });

describe("handling a message", () => {
  it("saves a note from the owner and replies to that message", async () => {
    const { db, sent, ctx } = await setup("+91 98765 43210");
    await handleIncoming(ctx, msg());
    expect((await db.select().from(schema.people)).length).toBe(1);
    expect(sent[0].r.text).toContain("*Neha Sharma*");
    expect(sent[0].replyTo).toBe("wamid.IN1");
  });

  it("ignores the same message when Meta sends it twice", async () => {
    const { db, sent, ctx } = await setup("919876543210");
    await handleIncoming(ctx, msg());
    const count = sent.length;
    await handleIncoming(ctx, msg());
    expect(sent.length).toBe(count);
    expect((await db.select().from(schema.interactions)).length).toBe(1);
  });

  it("does not answer or save for a stranger", async () => {
    const { db, sent, ctx } = await setup("919876543210");
    await handleIncoming(ctx, msg({ from: "919999999999" }));
    expect(sent.length).toBe(0);
    expect((await db.select().from(schema.people)).length).toBe(0);
  });

  it("with no owner set, tells the sender their number and saves nothing", async () => {
    const { db, sent, ctx } = await setup(null);
    await handleIncoming(ctx, msg());
    expect(sent[0].r.text).toContain("919876543210");
    expect(sent[0].r.text).toContain("WHATSAPP_OWNER");
    expect((await db.select().from(schema.people)).length).toBe(0);
  });

  it("replying to a card passes that card's text to Gemini", async () => {
    let seen = "";
    const { db, sent, ctx } = await setup("919876543210", async (i) => ((seen = i.text), result));
    await handleIncoming(ctx, msg());
    const card = sent[0];
    const [out] = await db.select().from(schema.waMessages).where(eq(schema.waMessages.direction, "out"));
    expect(out.body).toContain("Neha Sharma");
    await handleIncoming(ctx, msg({ id: "wamid.IN2", text: "she also likes golf", contextId: "wamid.OUT1" }));
    expect(seen).toContain("*Neha Sharma*");
    expect(seen).toContain("she also likes golf");
    expect(card).toBeTruthy();
  });

  it("a forwarded message is marked as forwarded and saved as source Forward", async () => {
    let seen = "";
    const { db, ctx } = await setup("919876543210", async (i) => ((seen = i.text), result));
    await handleIncoming(ctx, msg({ forwarded: true, text: "hello from Neha" }));
    expect(seen).toContain("(Forwarded message)");
    expect((await db.select().from(schema.interactions))[0].source).toBe("Forward");
  });

  it("a button press merges the duplicate", async () => {
    const { db, sent, ctx } = await setup("919876543210", async (i) => i.text.includes("again")
      ? { ...result, people: [{ ...result.people[0], name: "Neha", company: "", caresAbout: "Hiring" }] } : result);
    await handleIncoming(ctx, msg());
    await handleIncoming(ctx, msg({ id: "wamid.IN2", text: "Met Neha again" }));
    const ask = sent.map((s) => s.r).find((r) => r.buttons)!;
    await handleIncoming(ctx, msg({ id: "wamid.IN3", kind: "button", text: "", buttonId: ask.buttons![0].id }));
    expect((await db.select().from(schema.people)).length).toBe(1);
  });

  it("an error is reported by name only, with no note text in it", async () => {
    const { sent, ctx } = await setup("919876543210", async () => { throw new TypeError("secret detail about Neha"); });
    await handleIncoming(ctx, msg());
    expect(sent[0].r.text).toBe("Could not save that (TypeError). Please send it again.");
  });

  it("an unsupported message type gets a hint", async () => {
    const { sent, ctx } = await setup("919876543210");
    await handleIncoming(ctx, msg({ kind: "other", text: "" }));
    expect(sent[0].r.text).toContain("voice note");
  });
});
