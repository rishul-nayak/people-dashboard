// Same rules as the Telegram bot (people-inbox/config.yaml).
export const WORLDS = [
  "Startups & tech",
  "VC & founders",
  "Policy & politics",
  "Famous & powerful",
  "Creators & media",
  "School and work roots",
  "Friends",
  "Family",
  "Other",
];

// Days between contacts. 0 = never reminded.
export const TIER_DAYS: Record<string, number> = {
  "Inner circle": 0,
  Ally: 21,
  "Tier 1": 30,
  "Tier 2": 90,
  "Tier 3": 365,
  Dormant: 0,
};

// Ping order: lower first.
export const TIER_RANK: Record<string, number> = {
  Ally: 0,
  "Tier 1": 1,
  "Tier 2": 2,
  "Tier 3": 3,
};

// Node radius on the map: closer tier = bigger.
export const TIER_SIZE: Record<string, number> = {
  "Inner circle": 9,
  Ally: 8,
  "Tier 1": 6,
  "Tier 2": 5,
  "Tier 3": 4,
  Dormant: 3,
};

// Data source IDs are not secrets. The token is.
export const IDS = {
  people: process.env.PEOPLE_DS_ID || "b804cf67-2563-4702-8509-2a5a16a8b733",
  interactions: process.env.INTERACTIONS_DS_ID || "2f219745-5ffa-4669-b8be-5b8d959fc810",
  promises: process.env.PROMISES_DS_ID || "4e807ebb-dcab-46c0-905a-c8f1cbb6938b",
};

export const TIMEZONE = "Asia/Kolkata";
