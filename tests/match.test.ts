import { describe, expect, it } from "vitest";
import { find, nameScore, normLinkedin, normName } from "@/capture/match";

const row = (id: string, name: string, extra: Record<string, string> = {}) => ({ id, name, company: "", linkedin: "", email: "", phone: "", ...extra });

describe("name matching (same cases as the Telegram bot tests)", () => {
  it("drops titles and accents", () => {
    expect(normName("Dr. Néha  Sharma ji")).toBe("neha sharma");
  });
  it("scores names", () => {
    expect(nameScore("Neha Sharma", "neha sharma")).toBe(1);
    expect(nameScore("Sharma Neha", "Neha Sharma")).toBe(0.98);
    expect(nameScore("Neha", "Neha Sharma")).toBe(0.8);
    expect(nameScore("Neha Sharma", "Ankit Jain")).toBeLessThan(0.5);
    expect(nameScore("Neha Sharma", "Neha Verma")).toBeLessThan(0.92);
  });
  it("matches by LinkedIn even when the name differs", () => {
    const rows = [row("1", "N. Sharma", { linkedin: "https://www.linkedin.com/in/nehasharma/" })];
    const f = find({ name: "Neha", linkedin: "linkedin.com/in/nehasharma?utm=x" }, rows);
    expect(f.kind).toBe("same");
    expect(f.rows[0]?.id).toBe("1");
    expect(normLinkedin("https://in.linkedin.com/in/ab-c/")).toBe("ab-c");
  });
  it("same, maybe, new", () => {
    const rows = [row("1", "Neha Sharma", { company: "Razorpay" }), row("2", "Ankit Jain")];
    expect(find({ name: "Neha Sharma" }, rows).kind).toBe("same");
    expect(find({ name: "Neha" }, rows).kind).toBe("maybe");
    expect(find({ name: "Neha Sharma", company: "Zepto" }, rows).kind).toBe("maybe"); // company clash: ask
    expect(find({ name: "Priya Nair" }, rows).kind).toBe("new");
  });
  it("two people with the same name: ask", () => {
    const f = find({ name: "Rahul Gupta" }, [row("1", "Rahul Gupta"), row("2", "Rahul Gupta")]);
    expect(f.kind).toBe("maybe");
    expect(f.rows.length).toBe(2);
  });
  it("voice spelling matches LinkedIn spelling", () => {
    expect(nameScore("Abhijeet Menon", "Abhijith Menon")).toBeGreaterThanOrEqual(0.92);
    expect(nameScore("Neha Sharma", "Neha Verma")).toBeLessThan(0.92);
    expect(nameScore("Rahul Gupta", "Rohit Gupta")).toBeLessThan(0.92);
    expect(find({ name: "Abhijeet Menon" }, [row("1", "Abhijith Menon")]).kind).toBe("same");
  });
});
