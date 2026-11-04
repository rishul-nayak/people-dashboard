import { describe, expect, it } from "vitest";
import { buildPrompt, normalise } from "@/capture/extract";

describe("cleaning Gemini output", () => {
  it("drops the owner, bad fields, future dates and bad promises", () => {
    const out = normalise(
      {
        people: [{ name: "Rishul" }, { name: "  Neha   Sharma " }, { name: "" }, { name: "Ankit", world: "Made up", email: "not-an-email", linkedin_url: "x.com/a" }],
        summary: "", type: "Party", date: "2099-01-01",
        promises: [{ who: "me", what: "send deck", due: "Friday" }, { who: "someone", what: "x" }],
        connections: [{ person: "Ankit", other: "Neha Sharma", kind: "introduced_me" }, { person: "Rishul", other: "Ankit", kind: "knows" }, { person: "A", other: "B", kind: "weird" }],
      },
      "2026-11-04",
    );
    expect(out.people.map((p) => p.name)).toEqual(["Neha Sharma", "Ankit"]);
    expect(out.people[1]).toMatchObject({ world: "", email: "", linkedin: "" });
    expect(out.type).toBe("Note");
    expect(out.summary).toBe("Note");
    expect(out.date).toBe("2026-11-04");
    expect(out.promises).toEqual([{ who: "me", person: "", what: "send deck", due: "" }]);
    expect(out.connections).toEqual([{ person: "Ankit", other: "Neha Sharma", kind: "introduced_me" }]);
  });

  it("survives garbage", () => {
    expect(normalise(null, "2026-11-04").people).toEqual([]);
    expect(normalise({ people: "x", promises: 5 }, "2026-11-04").promises).toEqual([]);
  });

  it("rejects dates that do not exist", () => {
    expect(normalise({ people: [], date: "2026-02-31" }, "2026-11-04").date).toBe("2026-11-04");
  });

  it("prompt names the owner, weekday and event", () => {
    const p = buildPrompt("2026-11-04", "AI meetup");
    expect(p).toContain("Wednesday");
    expect(p).toContain("AI meetup");
    expect(p).not.toContain("{owner}");
    expect(p).not.toContain("{worlds}");
  });
});
