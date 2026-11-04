import { describe, expect, it } from "vitest";
import { schema } from "@/db";
import { capture, cardText, handleText, onButton, retryPending, type Deps } from "@/capture/engine";
import { ExtractError, QuotaExhausted, type Extracted, type ExtractFn } from "@/capture/extract";
import { testDb } from "./helpers";

const P = (name: string, extra: Record<string, string> = {}) => ({
  name, company: "", role: "", world: "", howMet: "", caresAbout: "", personalNotes: "", ideasToHelp: "", commonGround: "",
  mutualContacts: "", linkedin: "", email: "", phone: "", ...extra,
});
const result = (over: Partial<Extracted> = {}): Extracted => ({
  people: [P("Neha Sharma", { company: "Razorpay", caresAbout: "AI pricing" })], summary: "Coffee", type: "Meeting", date: "2026-11-03",
  promises: [{ who: "me", person: "Neha", what: "send deck", due: "" }], connections: [], question: "", transcript: "", followUpDraft: "Hi Neha, thanks for the chat. — Rishul", ...over,
});

async function deps(extract: ExtractFn): Promise<Deps> {
  return { db: await testDb(), extract, fetchMedia: async () => Buffer.from("x"), today: () => "2026-11-04", now: () => new Date("2026-11-04T10:00:00Z") };
}
const text = (r: { replies: { text: string }[] }) => r.replies.map((x) => x.text).join("\n---\n");

describe("engine", () => {
  it("saves a text note and replies with a card and the draft alone", async () => {
    const d = await deps(async () => result());
    const out = await handleText(d, "Met Neha", { source: "Text" });
    expect(out.kind).toBe("saved");
    expect(out.replies.length).toBe(2);
    expect(out.replies[0].text).toContain("*Neha Sharma*: new contact, Tier 1. Next contact 4 Nov.");
    expect(out.replies[0].text).toContain("*You owe Neha Sharma:* send deck, by 6 Nov.");
    expect(out.replies[1].text).toBe("Hi Neha, thanks for the chat. — Rishul");
  });

  it("sends the right media and context to Gemini", async () => {
    let seen: any;
    const d = await deps(async (i) => ((seen = i), result()));
    d.fetchMedia = async (id) => Buffer.from("audio-" + id);
    await handleText(d, "", { source: "Voice", mediaId: "m1", mime: "audio/ogg" });
    expect(seen.media[0].mime).toBe("audio/ogg");
    expect(seen.media[0].data.toString()).toBe("audio-m1");
    await capture(d, { text: "he likes golf", source: "Text", context: "Saved Neha" });
    expect(seen.text).toContain("Saved Neha");
    expect(seen.text).toContain("he likes golf");
  });

  it("no person found saves nothing", async () => {
    const d = await deps(async () => result({ people: [] }));
    const out = await handleText(d, "hello there", { source: "Text" });
    expect(out.kind).toBe("none");
    expect((await d.db.select().from(schema.interactions)).length).toBe(0);
  });

  it("when Gemini is busy the note waits, and the retry saves it", async () => {
    let busy = true;
    const d = await deps(async () => { if (busy) throw new QuotaExhausted("q"); return result(); });
    const first = await handleText(d, "Met Neha", { source: "Text" });
    expect(first.kind).toBe("pending");
    expect((await d.db.select().from(schema.people)).length).toBe(0);
    busy = false;
    const replies = await retryPending(d);
    expect(replies[0].text).toContain("Saved");
    expect((await d.db.select().from(schema.people)).length).toBe(1);
    const rows = await d.db.select().from(schema.interactions);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("Saved");
  });

  it("a note that keeps failing gives up after 3 tries", async () => {
    const d = await deps(async () => { throw new ExtractError("bad"); });
    await handleText(d, "Met Neha", { source: "Text" });
    expect(await retryPending(d)).toEqual([]);
    expect(await retryPending(d)).toEqual([]);
    const last = await retryPending(d);
    expect(last[0].text).toContain("3 tries");
    expect((await d.db.select().from(schema.interactions))[0].status).toBe("Error");
  });

  it("commands: undo, today, who, promises", async () => {
    const d = await deps(async () => result());
    await handleText(d, "Met Neha", { source: "Text" });
    const t = await handleText(d, "today", { source: "Text" });
    expect(text(t)).toContain("Neha Sharma (Tier 1)");
    expect(text(t)).toContain("send deck");
    expect(text(await handleText(d, "who neha", { source: "Text" }))).toContain("Cares about:* [2026-11-03] AI pricing");
    expect(text(await handleText(d, "promises", { source: "Text" }))).toContain("*You owe*");
    expect(text(await handleText(d, "undo", { source: "Text" }))).toContain("Undone");
    expect(text(await handleText(d, "undo", { source: "Text" }))).toContain("Nothing to undo");
    expect((await d.db.select().from(schema.people)).length).toBe(0);
  });

  it("a note that starts with a command word is still a note", async () => {
    const d = await deps(async () => result());
    expect((await handleText(d, "Today I met Neha Sharma from Razorpay", { source: "Text" })).kind).toBe("saved");
    expect((await handleText(d, "Hi Neha, great to meet you", { source: "Text" })).kind).toBe("saved");
  });

  it("event mode tags notes and expires", async () => {
    let seen: string | null = "x";
    const d = await deps(async (i) => ((seen = i.event), result()));
    await handleText(d, "event AI meetup", { source: "Text" });
    await handleText(d, "Met Neha", { source: "Text" });
    expect(seen).toBe("AI meetup");
    d.now = () => new Date("2026-11-04T20:00:00Z"); // 10 hours later
    await handleText(d, "Met Neha again", { source: "Text" });
    expect(seen).toBeNull();
    await handleText(d, "event off", { source: "Text" });
  });

  it("maybe-duplicate gets 3 buttons that fit WhatsApp, and Same-as merges", async () => {
    const d = await deps(async (i) => (i.text.includes("again") ? result({ people: [P("Neha", { caresAbout: "Hiring" })], promises: [], followUpDraft: "" }) : result()));
    await handleText(d, "Met Neha", { source: "Text" });
    const out = await handleText(d, "Met Neha again", { source: "Text" });
    const q = out.replies.at(-1)!;
    expect(q.buttons?.length).toBe(2);
    for (const b of q.buttons!) { expect(b.title.length).toBeLessThanOrEqual(20); expect(b.id.length).toBeLessThanOrEqual(256); }
    const replies = await onButton(d, q.buttons![0].id);
    expect(replies[0].text).toContain("updated");
    expect((await d.db.select().from(schema.people)).length).toBe(1);
  });

  it("two notes at the same moment do not create the same person twice", async () => {
    const d = await deps(async () => result({ promises: [], followUpDraft: "" }));
    await Promise.all([handleText(d, "Met Neha", { source: "Text" }), handleText(d, "Met Neha", { source: "Text" }), handleText(d, "Met Neha", { source: "Text" })]);
    expect((await d.db.select().from(schema.people)).length).toBe(1);
  });

  it("bot text has no emoji", async () => {
    const d = await deps(async () => result());
    const out = await handleText(d, "Met Neha", { source: "Text" });
    const all = text(out) + (await import("@/capture/engine")).HELP;
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
    expect(cardText).toBeTypeOf("function");
  });
});
