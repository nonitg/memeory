import { env } from "./env";

// One tiny query function over two drivers:
// - Neon serverless (HTTP) when DATABASE_URL is set (production)
// - PGlite (embedded Postgres, stored in .data/) for zero-setup local dev
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA_VERSION = 1;

const SCHEMA: string[] = [
  `create table if not exists kv (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists items (
    id uuid primary key default gen_random_uuid(),
    client_id text unique,
    source text not null default 'web',
    kind text not null default 'note',
    title text not null,
    body text,
    url text,
    link_title text,
    link_description text,
    link_site text,
    summary text,
    tags text[] not null default '{}',
    actionable boolean not null default false,
    status text not null default 'active',
    enrich_state text not null default 'pending',
    enrich_attempts int not null default 0,
    sm_doc_id text,
    remind_at timestamptz,
    remind_done_at timestamptz,
    review_at timestamptz,
    ladder_idx smallint not null default 0,
    times_shown int not null default 0,
    last_shown_at timestamptz,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    search tsvector
  )`,
  `create index if not exists items_created_idx on items (created_at desc)`,
  `create index if not exists items_review_idx on items (status, review_at)`,
  `create index if not exists items_remind_idx on items (remind_at) where remind_done_at is null`,
  `create index if not exists items_url_idx on items (url)`,
  `create index if not exists items_search_idx on items using gin (search)`,
  `create or replace function items_before_write() returns trigger as $$
   begin
     new.search :=
       setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
       setweight(to_tsvector('english', array_to_string(new.tags, ' ')), 'A') ||
       setweight(to_tsvector('english', coalesce(new.link_title, '') || ' ' || coalesce(new.summary, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(new.body, '') || ' ' || coalesce(new.link_description, '') || ' ' || coalesce(new.url, '')), 'C');
     new.updated_at := now();
     return new;
   end
   $$ language plpgsql`,
  `drop trigger if exists items_before_write on items`,
  `create trigger items_before_write before insert or update on items
   for each row execute function items_before_write()`,
  `create table if not exists deliveries (
    id bigserial primary key,
    channel text not null,
    kind text not null,
    sent_on date not null,
    detail jsonb not null default '{}',
    created_at timestamptz not null default now(),
    unique (channel, kind, sent_on)
  )`,
];

declare global {
  var __brainDb: Promise<QueryFn> | undefined;
}

async function connect(): Promise<QueryFn> {
  let q: QueryFn;
  if (env.databaseUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(env.databaseUrl);
    q = (text, params = []) => sql.query(text, params) as Promise<Row[]>;
  } else {
    if (env.onVercel) throw new Error("DATABASE_URL is not set. Add a Neon database to this Vercel project.");
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.PGLITE_DIR || "./.data/pglite";
    mkdirSync(dir, { recursive: true });
    const db = await PGlite.create(dir);
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  await migrate(q);
  return q;
}

async function migrate(q: QueryFn) {
  try {
    const rows = await q(`select value from kv where key = 'schema_version'`);
    if (rows[0] && Number(rows[0].value) >= SCHEMA_VERSION) return;
  } catch {
    // kv table missing: fresh database
  }
  for (const stmt of SCHEMA) await q(stmt);
  await q(
    `insert into kv (key, value) values ('schema_version', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(SCHEMA_VERSION)],
  );
}

export async function query(text: string, params: unknown[] = []): Promise<Row[]> {
  if (!globalThis.__brainDb) {
    globalThis.__brainDb = connect().catch((err) => {
      globalThis.__brainDb = undefined;
      throw err;
    });
  }
  const q = await globalThis.__brainDb;
  return q(text, params);
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const rows = await query(`select value from kv where key = $1`, [key]);
  return rows[0] ? (rows[0].value as T) : null;
}

export async function kvSet(key: string, value: unknown) {
  await query(
    `insert into kv (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
