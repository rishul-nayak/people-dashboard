// Is this the same person as someone we already have? Pure functions, no database.
export const SAME = 0.92;
export const MAYBE = 0.72;

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "shri", "smt", "ji", "bhai"]);

export type Row = {
  id: string;
  name: string;
  company?: string;
  linkedin?: string;
  email?: string;
  phone?: string;
};
export type Probe = { name: string; company?: string; linkedin?: string; email?: string; phone?: string };

export function normName(s: string): string {
  const ascii = (s || "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  return ascii.split(/[^a-z]+/).filter((w) => w && !HONORIFICS.has(w)).join(" ");
}

export function normLinkedin(u?: string): string {
  const m = /linkedin\.com\/in\/([^/?#\s]+)/.exec((u || "").toLowerCase());
  return m ? m[1].replace(/\/+$/, "") : "";
}

export function normPhone(p?: string): string {
  const digits = (p || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** Sounds-alike key: Abhijeet and Abhijith both become bhjt. */
export function skeleton(word: string): string {
  let w = word.replace(/h(?=[^aeiou]|$)/g, "");
  w = w.replace(/[aeiouy]+/g, "");
  return w.replace(/(.)\1+/g, "$1");
}

export function soundsAlike(a: string, b: string): boolean {
  const ta = a.split(" ");
  const tb = b.split(" ");
  return ta.length === tb.length && ta.length >= 2 && ta.every((x, i) => skeleton(x) === skeleton(tb[i]) && skeleton(x).length >= 2);
}

/** Same idea as Python's difflib ratio: 2 * matching characters / total characters. */
export function ratio(a: string, b: string): number {
  const total = a.length + b.length;
  if (!total) return 1;
  const matches = (alo: number, ahi: number, blo: number, bhi: number): number => {
    let best = 0, bi = alo, bj = blo;
    for (let i = alo; i < ahi; i++) {
      for (let j = blo; j < bhi; j++) {
        let k = 0;
        while (i + k < ahi && j + k < bhi && a[i + k] === b[j + k]) k++;
        if (k > best) { best = k; bi = i; bj = j; }
      }
    }
    if (!best) return 0;
    return best + matches(alo, bi, blo, bj) + matches(bi + best, ahi, bj + best, bhi);
  };
  return (2 * matches(0, a.length, 0, b.length)) / total;
}

export function nameScore(a0: string, b0: string): number {
  const a = normName(a0);
  const b = normName(b0);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (soundsAlike(a, b)) return 0.95; // voice note spelling vs LinkedIn spelling
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (new Set(ta).size === new Set(tb).size && ta.every((x) => tb.includes(x)) && tb.every((x) => ta.includes(x))) return 0.98; // "Sharma Neha"
  if (ta.length === 1 || tb.length === 1) {
    const [short, long] = ta.length === 1 ? [ta, tb] : [tb, ta];
    return short[0] === long[0] ? 0.8 : 0; // "Neha" vs "Neha Sharma": possible, never certain
  }
  if (ta[0] !== tb[0] && ta[ta.length - 1] !== tb[tb.length - 1]) return ratio(a, b) * 0.6;
  return ratio(a, b);
}

export type Found<R extends Row> = { kind: "same"; rows: [R] } | { kind: "maybe"; rows: R[] } | { kind: "new"; rows: [] };

export function find<R extends Row>(person: Probe, rows: R[]): Found<R> {
  const li = normLinkedin(person.linkedin);
  const email = (person.email || "").toLowerCase();
  const phone = normPhone(person.phone);
  for (const r of rows) {
    if ((li && li === normLinkedin(r.linkedin)) || (email && email === (r.email || "").toLowerCase()) || (phone && phone === normPhone(r.phone))) {
      return { kind: "same", rows: [r] };
    }
  }
  const scored = rows.map((r) => ({ s: nameScore(person.name, r.name), r })).sort((x, y) => y.s - x.s);
  if (!scored.length || scored[0].s < MAYBE) return { kind: "new", rows: [] };
  const { s: best, r: row } = scored[0];
  const pc = normName(person.company || "");
  const rc = normName(row.company || "");
  const clash = !!(person.company && row.company) && !rc.includes(pc) && !pc.includes(rc);
  if (best >= SAME && !clash) {
    if (scored.length > 1 && scored[1].s >= SAME) return { kind: "maybe", rows: [scored[0].r, scored[1].r] }; // two people, same name: ask
    return { kind: "same", rows: [row] };
  }
  return { kind: "maybe", rows: scored.slice(0, 2).filter((x) => x.s >= MAYBE).map((x) => x.r) };
}
