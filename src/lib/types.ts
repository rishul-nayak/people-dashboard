export type Person = {
  id: string;
  name: string;
  tier: string;
  world: string;
  company: string;
  role: string;
  howMet: string;
  caresAbout: string;
  personalNotes: string;
  ideasToHelp: string;
  commonGround: string;
  mutualContacts: string;
  linkedin: string;
  email: string;
  phone: string;
  lastContact: string | null;
  nextContact: string | null;
  created: string;
  knowsIds: string[];
  introducedById: string | null;
};

export type Owed = {
  id: string;
  what: string;
  who: "Me" | "Them";
  personId: string | null;
  due: string | null;
  done: boolean;
};

export type Interaction = {
  id: string;
  summary: string;
  date: string | null;
  type: string;
  personIds: string[];
  event: string;
};

export type Data = {
  people: Person[];
  owed: Owed[];
  interactions: Interaction[];
  today: string;
  source: "notion" | "demo";
  note: string | null;
};
