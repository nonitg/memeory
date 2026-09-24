import { query, type Row } from "./db";
import { env, features } from "./env";
import { localDate } from "./time";
import { hostOf, KINDS, type Item, type ItemAction, type Kind } from "./types";

// Spaced resurfacing: first look 3 days after capture, then 14, 45, 120, 365.
// ladder_idx counts completed looks; this SQL picks the next gap from the OLD value.
export const FIRST_REVIEW_DAYS = 3;
const NEXT_GAP_DAYS = `(case least(ladder_idx, 3) when 0 then 14 when 1 then 45 when 2 then 120 else 365 end)`;
const TODAY_START = `(($1::date)::timestamp at time zone $2)`;

function iso(v: unknown): string | null {
  return v ? new Date(v as string).toISOString() : null;
}

export function toItem(r: Row): Item {
  return {
    id: r.id,
    source: r.source,
    kind: (KINDS as readonly string[]).includes(r.kind) ? (r.kind as Kind) : "note",
    title: r.title,
    body: r.body,
    url: r.url,
    linkTitle: r.link_title,
    linkDescription: r.link_description,
    linkSite: r.link_site,
    summary: r.summary,
    tags: r.tags ?? [],
    actionable: !!r.actionable,
    status: r.status,
    enrichState: r.enrich_state,
    remindAt: iso(r.remind_at),
    remindDoneAt: iso(r.remind_done_at),
    reviewAt: iso(r.review_at),
    timesShown: r.times_shown ?? 0,
    lastShownAt: iso(r.last_shown_at),
    createdAt: iso(r.created_at)!,
  };
}

// ---------- capture ----------

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;
const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|igshid|si|ref_src|ref)$/i;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export function splitCapture(text?: string | null, url?: string | null) {
  let body = (text ?? "").replace(/\r\n/g, "\n").trim();
  let link = (url ?? "").trim() || null;
  if (!link) {
    const m = body.match(URL_RE);
    if (m) link = m[0].replace(/[.,;:!?)\]]+$/, "");
  }
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) {
    // Not a web link (e.g. "javascript:" or junk from a client): keep it as text instead.
    body = [body, link].filter(Boolean).join("\n");
    link = null;
  }
  if (link) {
    body = body.replace(link, "").replace(/[ \t]{2,}/g, " ").trim();
    link = normalizeUrl(link);
  }
  return { body: body || null, url: link };
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${sp > n * 0.6 ? cut.slice(0, sp) : cut}…`;
}

export function quickTitle(body: string | null, url: string | null, linkTitle: string | null): string {
  if (linkTitle) return clip(linkTitle, 90);
  const first = body?.split("\n").find((l) => l.trim());
  if (first) return clip(first, 90);
  if (url) {
    const host = hostOf(url) ?? url;
    try {
      const path = new URL(url).pathname.replace(/\/$/, "");
      return clip(path && path !== "/" ? `${host}${path}` : host, 90);
    } catch {
      return clip(host, 90);
    }
  }
  return "Untitled";
}

export class CaptureError extends Error {}

/** Shortcuts can send "Device Model" (iPhone, iPad, Mac) as the source. */
function normalizeSource(raw?: string | null): string {
  const s = (raw || "web").trim().toLowerCase().slice(0, 20);
  if (/iphone|ipad|ios|ipod/.test(s)) return "ios";
  if (/mac/.test(s)) return "mac";
  return s.replace(/[^a-z0-9-]/g, "") || "web";
}

export type CaptureInput = {
  text?: string | null;
  url?: string | null;
  title?: string | null;
  source?: string | null;
  clientId?: string | null;
};

export async function createItem(input: CaptureInput): Promise<{ item: Item; duplicate: boolean }> {
  const { body, url } = splitCapture(input.text, input.url);
  if (!body && !url) throw new CaptureError("Nothing to save");
  if (body && body.length > 20_000) throw new CaptureError("That's too long for one capture (20k characters max)");
  const source = normalizeSource(input.source);
  const clientId = input.clientId ? String(input.clientId).slice(0, 120) : null;

  if (clientId) {
    const existing = await query(`select * from items where client_id = $1`, [clientId]);
    if (existing[0]) return { item: toItem(existing[0]), duplicate: false };
  }

  // Same link again with nothing new to say: bring the old one back instead of duplicating it.
  if (url) {
    const dup = await query(
      `select id from items where url = $1 and ($2::text is null or body = $2) order by created_at desc limit 1`,
      [url, body],
    );
    if (dup[0]) {
      const rows = await query(
        `update items set status = 'active',
           review_at = least(coalesce(review_at, now() + interval '1 day'), now() + interval '1 day')
         where id = $1 returning *`,
        [dup[0].id],
      );
      return { item: toItem(rows[0]), duplicate: true };
    }
  }

  const linkTitle = input.title?.trim() ? clip(input.title, 200) : null;
  const kind: Kind = url && !body ? "link" : "note";
  const rows = await query(
    `insert into items (client_id, source, kind, title, body, url, link_title, review_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8))
     on conflict (client_id) do nothing
     returning *`,
    [clientId, source, kind, quickTitle(body, url, linkTitle), body, url, linkTitle, FIRST_REVIEW_DAYS],
  );
  if (rows[0]) return { item: toItem(rows[0]), duplicate: false };
  const existing = await query(`select * from items where client_id = $1`, [clientId]);
  return { item: toItem(existing[0]), duplicate: false };
}

// ---------- reads ----------

export async function getItem(id: string): Promise<Item | null> {
  if (!isUuid(id)) return null;
  const rows = await query(`select * from items where id = $1`, [id]);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function getItems(ids: string[]): Promise<Item[]> {
  const valid = ids.filter(isUuid);
  if (!valid.length) return [];
  const rows = await query(`select * from items where id = any($1::uuid[])`, [valid]);
  const byId = new Map(rows.map((r) => [r.id as string, toItem(r)]));
  return valid.map((id) => byId.get(id)).filter((x): x is Item => !!x);
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function listItems(opts: {
  cursor?: string | null;
  kind?: string | null;
  archived?: boolean;
  limit?: number;
}): Promise<{ items: Item[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 40, 100);
  const params: unknown[] = [];
  const where = [opts.archived ? `status = 'archived'` : `status = 'active'`];
  if (opts.kind && (KINDS as readonly string[]).includes(opts.kind)) {
    params.push(opts.kind);
    where.push(`kind = $${params.length}`);
  }
  if (opts.cursor) {
    params.push(opts.cursor);
    where.push(`created_at < $${params.length}::timestamptz`);
  }
  params.push(limit + 1);
  const rows = await query(
    `select * from items where ${where.join(" and ")} order by created_at desc limit $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit).map(toItem);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].createdAt : null };
}

/** Due for a look, or already shown in today's digest and not yet answered. */
export async function reviewQueue(limit = 5): Promise<Item[]> {
  const rows = await query(
    `select * from items
     where status = 'active' and (
       (review_at is not null and review_at <= now())
       or (last_shown_at >= ${TODAY_START} and (reviewed_at is null or reviewed_at < last_shown_at))
     )
     order by last_shown_at desc nulls last, review_at asc
     limit $3`,
    [localDate(), env.tz, limit],
  );
  return rows.map(toItem);
}

export async function dueForReviewIds(limit = 3): Promise<string[]> {
  const rows = await query(
    `select id from items where status = 'active' and review_at is not null and review_at <= now()
     order by review_at asc limit $1`,
    [limit],
  );
  return rows.map((r) => r.id);
}

/** Reminders due today or overdue, not yet marked done. */
export async function remindersDue(): Promise<Item[]> {
  const rows = await query(
    `select * from items
     where status = 'active' and remind_at is not null and remind_done_at is null
       and remind_at < ((($1::date + 1))::timestamp at time zone $2)
     order by remind_at asc limit 20`,
    [localDate(), env.tz],
  );
  return rows.map(toItem);
}

export async function nextReviewAt(): Promise<string | null> {
  const rows = await query(`select min(review_at) as next from items where status = 'active' and review_at > now()`);
  return iso(rows[0]?.next);
}

export async function upcomingReminders(days = 7): Promise<Item[]> {
  const rows = await query(
    `select * from items
     where status = 'active' and remind_at is not null and remind_done_at is null
       and remind_at >= now() and remind_at < now() + make_interval(days => $1)
     order by remind_at asc limit 20`,
    [days],
  );
  return rows.map(toItem);
}

export async function itemsOnLocalDate(ymd: string): Promise<Item[]> {
  const rows = await query(
    `select * from items where (created_at at time zone $2)::date = $1::date order by created_at asc`,
    [ymd, env.tz],
  );
  return rows.map(toItem);
}

export async function itemsSince(days: number): Promise<Item[]> {
  const rows = await query(
    `select * from items where created_at >= now() - make_interval(days => $1) order by created_at asc`,
    [days],
  );
  return rows.map(toItem);
}

export async function randomOldItems(n: number, olderThanDays = 30): Promise<Item[]> {
  const rows = await query(
    `select * from items where status = 'active' and created_at < now() - make_interval(days => $2)
     order by random() limit $1`,
    [n, olderThanDays],
  );
  return rows.map(toItem);
}

export async function topTags(limit = 40): Promise<{ tag: string; n: number }[]> {
  const rows = await query(
    `select t as tag, count(*)::int as n from items, unnest(tags) t
     where status = 'active' group by t order by n desc, t asc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ tag: r.tag, n: r.n }));
}

export async function stats() {
  const [totals, sources] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where created_at >= now() - interval '7 days')::int as week,
              count(*) filter (where enrich_state = 'done')::int as enriched,
              count(*) filter (where sm_doc_id is not null)::int as synced
       from items`,
    ),
    query(`select source, max(created_at) as last from items group by source`),
  ]);
  const lastBySource: Record<string, string> = {};
  for (const s of sources) lastBySource[s.source] = iso(s.last)!;
  return { ...(totals[0] as { total: number; week: number; enriched: number; synced: number }), lastBySource };
}

// ---------- search ----------

export async function searchItems(q: string, limit = 25): Promise<Item[]> {
  q = q.trim();
  if (!q) return [];

  if (/^#[\w-]+$/.test(q)) {
    const rows = await query(
      `select * from items where $1 = any(tags) order by created_at desc limit 60`,
      [q.slice(1).toLowerCase()],
    );
    return rows.map(toItem);
  }

  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const ftsFor = (op: "&" | "|") => {
    const tq = words.map((w) => `${w}:*`).join(` ${op} `);
    return tq
      ? query(
          `select *, ts_rank(search, to_tsquery('english', $1)) as rank from items
           where search @@ to_tsquery('english', $1) or title ilike $2 or url ilike $2
           order by rank desc, created_at desc limit 40`,
          [tq, like],
        )
      : query(
          `select *, 0 as rank from items where title ilike $1 or body ilike $1 or url ilike $1
           order by created_at desc limit 40`,
          [like],
        );
  };

  const { smSearch } = await import("./supermemory");
  const [strict, sem] = await Promise.all([
    ftsFor("&"),
    features.supermemory ? smSearch(q).catch(() => []) : Promise.resolve([]),
  ]);
  // Natural-language queries rarely contain every word; widen to "any word" when strict finds little.
  let fts = strict;
  if (strict.length < 5 && words.length > 1) {
    const seen = new Set(strict.map((r) => r.id));
    const loose = (await ftsFor("|")).filter((r) => !seen.has(r.id)).map((r) => ({ ...r, loose: true }));
    fts = [...strict, ...loose];
  }

  const score = new Map<string, number>();
  const rowsById = new Map<string, Row>();
  fts.forEach((r, i) => {
    rowsById.set(r.id, r);
    score.set(r.id, (r.loose ? 0.4 : 1) + Math.min(Number(r.rank) || 0, 1) - i * 0.001);
  });
  const missing = sem.map((s) => s.itemId).filter((id) => !rowsById.has(id));
  if (missing.length) {
    for (const it of await query(`select * from items where id = any($1::uuid[])`, [missing.filter(isUuid)])) {
      rowsById.set(it.id, it);
    }
  }
  for (const s of sem) {
    if (!rowsById.has(s.itemId)) continue;
    score.set(s.itemId, (score.get(s.itemId) ?? 0) + s.similarity);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => toItem(rowsById.get(id)!));
}

// ---------- actions ----------

export async function applyAction(id: string, action: ItemAction, date?: string): Promise<Item | null> {
  if (!isUuid(id)) return null;
  const today = localDate();
  let sql: string;
  let params: unknown[] = [id];
  switch (action) {
    case "got":
      // If it's due, count this as a look and push it out. If the digest already did, just note the answer.
      sql = `update items set reviewed_at = now(),
               times_shown = case when review_at is null or review_at <= now() then times_shown + 1 else times_shown end,
               review_at = case when review_at is null or review_at <= now()
                 then now() + make_interval(days => ${NEXT_GAP_DAYS}) else review_at end,
               ladder_idx = case when review_at is null or review_at <= now() then ladder_idx + 1 else ladder_idx end
             where id = $1 returning *`;
      break;
    case "again":
      sql = `update items set reviewed_at = now(), ladder_idx = 0, status = 'active',
               review_at = now() + interval '2 days' where id = $1 returning *`;
      break;
    case "archive":
      sql = `update items set status = 'archived', reviewed_at = now() where id = $1 returning *`;
      break;
    case "unarchive":
      sql = `update items set status = 'active',
               review_at = coalesce(review_at, now() + interval '3 days') where id = $1 returning *`;
      break;
    case "done":
      sql = `update items set remind_done_at = now() where id = $1 returning *`;
      break;
    case "tomorrow":
    case "nextweek":
    case "nextmonth":
    case "remind": {
      const offset = { tomorrow: 1, nextweek: 7, nextmonth: 30, remind: 0 }[action];
      const target = action === "remind" ? date : today;
      if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
      sql = `update items set remind_done_at = null, status = 'active',
               remind_at = (($2::date + $3::int) + time '08:00') at time zone $4
             where id = $1 returning *`;
      params = [id, target, offset, env.tz];
      break;
    }
    default:
      return null;
  }
  const rows = await query(sql, params);
  return rows[0] ? toItem(rows[0]) : null;
}

/** Called when the digest shows items. Skips anything already counted today. */
export async function markShown(ids: string[]) {
  if (!ids.length) return;
  await query(
    `update items set times_shown = times_shown + 1, last_shown_at = now(),
       review_at = now() + make_interval(days => ${NEXT_GAP_DAYS}),
       ladder_idx = ladder_idx + 1
     where id = any($3::uuid[]) and (last_shown_at is null or last_shown_at < ${TODAY_START})`,
    [localDate(), env.tz, ids],
  );
}

export async function deleteItem(id: string): Promise<{ item: Item; smDocId: string | null } | null> {
  if (!isUuid(id)) return null;
  const rows = await query(`delete from items where id = $1 returning *`, [id]);
  return rows[0] ? { item: toItem(rows[0]), smDocId: rows[0].sm_doc_id ?? null } : null;
}
