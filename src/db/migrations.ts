// Plain SQL, applied in order, once. To change the database later, add a new string at the end.
// Never edit an old one.
export const MIGRATIONS: string[] = [
  `
  create table people (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    tier text not null default 'Tier 1',
    world text not null default '',
    company text not null default '',
    role text not null default '',
    how_met text not null default '',
    cares_about text not null default '',
    personal_notes text not null default '',
    ideas_to_help text not null default '',
    common_ground text not null default '',
    mutual_contacts text not null default '',
    linkedin text not null default '',
    email text not null default '',
    phone text not null default '',
    last_contact date,
    next_contact date,
    legacy_id text unique,
    created_at timestamptz not null default now()
  );
  create index people_next_idx on people (next_contact);

  create table interactions (
    id uuid primary key default gen_random_uuid(),
    summary text not null default '',
    date date not null,
    type text not null default 'Note',
    source text not null default 'Text',
    event text not null default '',
    raw text not null default '',
    status text not null default 'Saved',
    data jsonb not null default '{}'::jsonb,
    legacy_id text unique,
    created_at timestamptz not null default now()
  );
  create index interactions_status_idx on interactions (status);

  create table interaction_people (
    interaction_id uuid not null references interactions(id) on delete cascade,
    person_id uuid not null references people(id) on delete cascade,
    primary key (interaction_id, person_id)
  );
  create index interaction_people_person_idx on interaction_people (person_id);

  create table promises (
    id uuid primary key default gen_random_uuid(),
    what text not null,
    who text not null default 'Me',
    person_id uuid references people(id) on delete set null,
    due date,
    done boolean not null default false,
    interaction_id uuid references interactions(id) on delete set null,
    legacy_id text unique,
    created_at timestamptz not null default now()
  );
  create index promises_open_idx on promises (done, due);

  create table edges (
    id uuid primary key default gen_random_uuid(),
    a_id uuid not null references people(id) on delete cascade,
    b_id uuid not null references people(id) on delete cascade,
    kind text not null default 'knows',
    note text not null default '',
    interaction_id uuid references interactions(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint edges_unique unique (a_id, b_id, kind),
    constraint edges_not_self check (a_id <> b_id)
  );

  create table wa_messages (
    id text primary key,
    direction text not null,
    body text not null default '',
    interaction_id uuid references interactions(id) on delete set null,
    created_at timestamptz not null default now()
  );

  create table settings (
    key text primary key,
    value jsonb not null
  );
  `,
];
