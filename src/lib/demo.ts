import type { Data, Interaction, Owed, Person } from "./types";
import { addDays } from "./util";

type Seed = Partial<Person> & Pick<Person, "id" | "name" | "tier" | "world">;

// Made-up people so the map and lists have something to show.
export function demoData(today: string): Data {
  const d = (n: number) => addDays(today, n);
  const mk = (s: Seed, last: number | null, next: number | null, created = -60): Person => ({
    company: "", role: "", howMet: "", caresAbout: "", personalNotes: "", ideasToHelp: "",
    commonGround: "", mutualContacts: "", linkedin: "", email: "", phone: "",
    knowsIds: [], introducedById: null,
    ...s,
    lastContact: last === null ? null : d(last),
    nextContact: next === null ? null : d(next),
    created: d(created) + "T09:00:00.000Z",
  });

  const people: Person[] = [
    mk({ id: "p1", name: "Aarav Mehta", tier: "Ally", world: "Startups & tech", company: "Kiwi Labs", role: "Founder",
      howMet: "Demo day in Bengaluru", caresAbout: `${d(-40)}: hiring a first AI product manager`,
      ideasToHelp: `${d(-40)}: intro to Meera for a launch video`, commonGround: "IIT alumni, both from Madhya Pradesh",
      mutualContacts: `${d(-40)}: Sana Qureshi, Rohan Iyer`, linkedin: "https://www.linkedin.com/in/example-aarav" }, -40, -2),
    mk({ id: "p2", name: "Sana Qureshi", tier: "Tier 1", world: "VC & founders", company: "Lotus Ventures", role: "Associate",
      howMet: "Startup mixer, Indiranagar", caresAbout: `${d(-30)}: looking for seed-stage AI tools`,
      mutualContacts: `${d(-30)}: Vikram Chauhan`, email: "sana@example.com" }, -30, 0),
    mk({ id: "p3", name: "Rohan Iyer", tier: "Tier 1", world: "Startups & tech", company: "Kiwi Labs", role: "Engineer",
      howMet: "Intro from Aarav", introducedById: "p1", caresAbout: `${d(-12)}: moving into infra work` }, -12, 5),
    mk({ id: "p4", name: "Meera Nair", tier: "Tier 2", world: "Creators & media", company: "Frame Studio", role: "Video producer",
      howMet: "Panel on creator tools", caresAbout: `${d(-55)}: growing a small YouTube channel` }, -55, 20),
    mk({ id: "p5", name: "Dev Malhotra", tier: "Tier 2", world: "Policy & politics", company: "Civic Lab", role: "Researcher",
      howMet: "Policy fellowship alumni call", caresAbout: `${d(-70)}: public data for city budgets` }, -70, 18),
    mk({ id: "p6", name: "Ishita Rao", tier: "Ally", world: "School and work roots", company: "Accenture", role: "Consultant",
      howMet: "Same joining batch", caresAbout: `${d(-22)}: moving to a product team`,
      mutualContacts: `${d(-22)}: Harsh Vora` }, -22, -1),
    mk({ id: "p7", name: "Kabir Sethi", tier: "Inner circle", world: "Friends", howMet: "College hostel" }, -3, null),
    mk({ id: "p8", name: "Ananya Das", tier: "Tier 1", world: "Startups & tech", company: "Orbit AI", role: "Product manager",
      howMet: "Product meetup", caresAbout: `${d(-31)}: shipping an agent feature`,
      mutualContacts: `${d(-31)}: Tanvi Joshi` }, -31, 0),
    mk({ id: "p9", name: "Vikram Chauhan", tier: "Tier 2", world: "VC & founders", company: "Lotus Ventures", role: "Partner",
      howMet: "Intro from Sana", introducedById: "p2", caresAbout: `${d(-40)}: portfolio founders who need product help` }, -40, 50),
    mk({ id: "p10", name: "Tanvi Joshi", tier: "Tier 1", world: "Startups & tech", company: "Orbit AI", role: "Designer",
      howMet: "Intro from Ananya", introducedById: "p8" }, -20, 3),
    mk({ id: "p11", name: "Harsh Vora", tier: "Tier 3", world: "School and work roots", company: "Fabric", role: "Analyst",
      howMet: "Batchmate" }, -200, 150),
    mk({ id: "p12", name: "Nidhi Bansal", tier: "Tier 1", world: "Creators & media", company: "Reel Works", role: "Editor",
      howMet: "Content workshop", caresAbout: `${d(-29)}: building a newsletter`,
      mutualContacts: `${d(-29)}: Meera Nair` }, -29, 1),
    mk({ id: "p13", name: "Arjun Kapoor", tier: "Tier 3", world: "Famous & powerful", company: "Summit Group", role: "Chairman office" }, -120, 240),
    mk({ id: "p14", name: "Pooja Menon", tier: "Tier 2", world: "Friends", howMet: "Flatmate's friend" }, -45, 45),
    mk({ id: "p15", name: "Yash Agarwal", tier: "Tier 1", world: "Startups & tech", company: "Growthkit", role: "Founder",
      howMet: "Met yesterday at a founders' dinner", introducedById: "p1", caresAbout: `${d(-1)}: GTM tool for small agencies`,
      ideasToHelp: `${d(-1)}: share feedback on his GTM app` }, -1, 0, -1),
    mk({ id: "p16", name: "Rhea Kulkarni", tier: "Tier 3", world: "Policy & politics", company: "Think Forward", role: "Fellow" }, -150, 200),
  ];

  const owed: Owed[] = [
    { id: "o1", what: "Send my AI PM resume", who: "Me", personId: "p2", due: d(-1), done: false },
    { id: "o2", what: "Share feedback on his GTM app", who: "Me", personId: "p15", due: d(0), done: false },
    { id: "o3", what: "Intro to Meera for a launch video", who: "Me", personId: "p1", due: d(2), done: false },
    { id: "o4", what: "Intro to a portfolio founder", who: "Them", personId: "p9", due: d(6), done: false },
    { id: "o5", what: "Send the creator tools deck", who: "Them", personId: "p4", due: d(-4), done: true },
  ];

  const interactions: Interaction[] = [
    { id: "i1", summary: "Founders' dinner. Talked about GTM tools for agencies.", date: d(-1), type: "Meeting", personIds: ["p15"], event: "Founders' dinner" },
    { id: "i2", summary: "Coffee. He is hiring a first AI PM.", date: d(-40), type: "Meeting", personIds: ["p1"], event: "" },
    { id: "i3", summary: "Call about seed-stage AI tools.", date: d(-30), type: "Call", personIds: ["p2"], event: "" },
    { id: "i4", summary: "Lunch at office. She wants a product team move.", date: d(-22), type: "Meeting", personIds: ["p6"], event: "" },
    { id: "i5", summary: "Product meetup chat about agent features.", date: d(-31), type: "Event", personIds: ["p8", "p10"], event: "Product meetup" },
  ];

  return { people, owed, interactions, today, source: "demo", note: null };
}
