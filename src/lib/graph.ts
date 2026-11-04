import type { Person } from "./types";

export type GNode = { id: string; name: string; me?: boolean; person?: Person };
export type GLink = { source: string; target: string; kind: "you" | "knows" | "intro" | "company" };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Lines between people, from three sources:
 *  1. "Introduced by" and "Knows" columns, if they exist in Notion.
 *  2. Names that appear in someone's "Mutual contacts" text.
 *  3. Same company.
 * Every person is also joined to "You".
 */
export function buildGraph(people: Person[]): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [{ id: "me", name: "You", me: true }, ...people.map((p) => ({ id: p.id, name: p.name, person: p }))];
  const links: GLink[] = people.map((p) => ({ source: "me", target: p.id, kind: "you" as const }));
  const seen = new Set<string>();
  const byId = new Set(people.map((p) => p.id));

  const add = (a: string, b: string, kind: GLink["kind"]) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source: a, target: b, kind });
  };

  for (const p of people) {
    if (p.introducedById) add(p.introducedById, p.id, "intro");
    for (const k of p.knowsIds) add(p.id, k, "knows");
    const text = norm(p.mutualContacts);
    if (text) {
      for (const q of people) {
        if (q.id !== p.id && norm(q.name).length >= 5 && text.includes(norm(q.name))) add(p.id, q.id, "knows");
      }
    }
  }

  const byCompany = new Map<string, Person[]>();
  for (const p of people) {
    const c = norm(p.company);
    if (c.length >= 2) byCompany.set(c, [...(byCompany.get(c) || []), p]);
  }
  for (const group of byCompany.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) add(group[i].id, group[j].id, "company");
  }
  return { nodes, links };
}
