import { generateText, Output } from "ai";
import { z } from "zod";
import { query } from "./db";
import { env, features } from "./env";
import { clip, getItem, isUuid, topTags, toItem } from "./items";
import { fastModel } from "./llm";
import { smAdd } from "./supermemory";
import { localDate, nowForPrompt } from "./time";
import { hostOf, KINDS, type Item, type Kind } from "./types";
import { fetchLinkMeta, type LinkMeta } from "./urlmeta";

const Classification = z.object({
  kind: z.enum(KINDS).describe("What this capture is. See the rules in the system prompt."),
  title: z.string().describe("Specific, scannable title, 70 characters or less."),
  summary: z
    .string()
    .nullable()
    .describe("One sentence that adds what the title doesn't say. null if the title already covers it."),
  tags: z.array(z.string()).describe("1 to 4 lowercase kebab-case topic tags. Reuse existing tags when they fit."),
  actionable: z.boolean().describe("True if the user needs to do something."),
  remind_on: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD, only if the capture names or clearly implies a future date. Otherwise null."),
  remind_time: z.string().nullable().describe("HH:MM 24-hour, only if a clock time is stated. Otherwise null."),
  resurface: z
    .boolean()
    .describe("True if worth seeing again in spaced review. False for transient logistics, to-dos, and events."),
});
type Classification = z.infer<typeof Classification>;

const SYSTEM = `You file quick captures into a personal second brain. The user dumps things fast from their phone, Mac, or browser: thoughts, links, facts, to-dos, quotes, reminders. File each one so it can be found and resurfaced later.

kind:
- link: mainly a URL to read, watch, or keep
- todo: something the user needs to do
- event: something happening at a specific date or time
- fact: reusable information worth remembering (a number, a name, a how-to, trivia, a recommendation)
- idea: the user's own thought, plan, or proposal
- quote: someone else's words
- note: anything else

title: specific and scannable, 70 characters or less, in the user's own words when possible. For links, use the page's real title cleaned of site-name suffixes. Never start with "Note about" or "Link to".

summary: one sentence under 160 characters. For links, say what it is and why it might be worth it. For long text, give the gist. null when the title already says everything.

tags: 1 to 4 lowercase kebab-case topics. Reuse a tag from the existing list whenever one fits; invent one only when nothing fits. Tags are topics, never kinds (no "link", "note", "todo").

remind_on and remind_time: set only when the capture names or clearly implies a future date ("dentist Tuesday 3pm", "renew passport in March", "call mom tomorrow"). Resolve relative dates against the current local time given. A month alone means its 1st day. For an event, use the day of the event. Set remind_time only when a clock time is stated. Never invent dates.

resurface: true for things worth seeing again in spaced review (facts, ideas, quotes, links, insights). False for transient logistics (parking spots, codes, one-off errands), to-dos, events, and anything a reminder already covers.`;

function heuristic(item: Item, meta: LinkMeta | null): Classification {
  const text = item.body ?? "";
  const actionable = /^(todo|to do|buy|call|email|text|book|pay|remember to|don'?t forget|need to|renew|schedule|fix)\b/i.test(
    text,
  );
  const kind: Kind = item.url && text.length < 140 ? "link" : actionable ? "todo" : "note";
  return {
    kind,
    title: clip(meta?.title || item.linkTitle || item.title, 90),
    summary: meta?.description ? clip(meta.description, 200) : null,
    tags: [],
    actionable,
    remind_on: null,
    remind_time: null,
    resurface: kind !== "todo",
  };
}

function cleanTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const k = t
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    if (k && !["link", "note", "todo", "idea", "fact", "quote", "event"].includes(k)) out.add(k);
  }
  return [...out].slice(0, 4);
}

async function classify(item: Item, meta: LinkMeta | null): Promise<Classification> {
  const tags = (await topTags(60)).map((t) => t.tag);
  const lines = [
    `Current local time: ${nowForPrompt()}`,
    `Captured from: ${item.source}`,
    `Existing tags (most used first): ${tags.length ? tags.join(", ") : "(none yet)"}`,
  ];
  if (item.url) lines.push(`URL: ${item.url}`);
  const pageTitle = meta?.title || item.linkTitle;
  if (pageTitle) lines.push(`Page title: ${pageTitle}`);
  if (meta?.description) lines.push(`Page description: ${meta.description}`);
  lines.push(`Capture text:\n"""\n${item.body ?? "(none, just the URL)"}\n"""`);

  const { output } = await generateText({
    model: fastModel(),
    system: SYSTEM,
    prompt: lines.join("\n"),
    output: Output.object({ schema: Classification }),
    abortSignal: AbortSignal.timeout(45_000),
  });
  return output;
}

/** Organize one capture: link preview, AI filing, Supermemory sync. Safe to call repeatedly. */
export async function enrichItem(id: string): Promise<Item | null> {
  const item = await getItem(id);
  if (!item) return null;

  const meta = item.url && !item.linkDescription ? await fetchLinkMeta(item.url) : null;
  let c: Classification | null = null;
  let attempted = false;
  if (features.llm && item.enrichState !== "done") {
    attempted = true;
    try {
      c = await classify(item, meta);
    } catch (err) {
      console.error("enrich: model call failed", (err as Error).message);
    }
  }
  const done = !!c || item.enrichState === "done";
  const r = c ?? (item.enrichState === "done" ? null : heuristic(item, meta));

  const today = localDate();
  const remindOn = r?.remind_on && /^\d{4}-\d{2}-\d{2}$/.test(r.remind_on) && r.remind_on >= today ? r.remind_on : null;
  const remindTime = r?.remind_time && /^\d{2}:\d{2}$/.test(r.remind_time) ? r.remind_time : "08:00";

  const rows = await query(
    `update items set
       kind = coalesce($2, kind),
       title = coalesce($3, title),
       summary = coalesce($4, summary),
       tags = case when $5::text[] is null or cardinality($5::text[]) = 0 then tags else $5::text[] end,
       actionable = coalesce($6, actionable),
       link_title = coalesce(link_title, $7),
       link_description = coalesce(link_description, $8),
       link_site = coalesce(link_site, $9),
       remind_at = case when remind_at is null and $10::date is not null
                     then ($10::date + $11::time) at time zone $12 else remind_at end,
       review_at = case when $13::boolean is null then review_at
                        when $13 then coalesce(review_at, greatest(created_at + interval '3 days', now() + interval '1 day'))
                        else null end,
       enrich_state = $14,
       enrich_attempts = enrich_attempts + $15
     where id = $1 returning *`,
    [
      id,
      r?.kind ?? null,
      r?.title ? clip(r.title, 90) : null,
      r?.summary ? clip(r.summary, 220) : null,
      r ? cleanTags(r.tags) : null,
      r?.actionable ?? null,
      meta?.title ?? null,
      meta?.description ? clip(meta.description, 400) : null,
      meta?.site ?? (item.url ? hostOf(item.url) : null),
      remindOn,
      remindTime,
      env.tz,
      r ? r.resurface && !remindOn : null,
      done ? "done" : "fallback",
      attempted ? 1 : 0,
    ],
  );
  let updated = rows[0] ? toItem(rows[0]) : item;

  if (features.supermemory && !rows[0]?.sm_doc_id) {
    try {
      const docId = await smAdd(updated);
      await query(`update items set sm_doc_id = $2 where id = $1`, [id, docId]);
    } catch (err) {
      console.error("enrich: supermemory sync failed", (err as Error).message);
    }
  }

  if (remindOn && r?.remind_time && features.ntfy) {
    const { scheduleReminderPush } = await import("./channels/ntfy");
    await scheduleReminderPush(updated).catch(() => undefined);
  }
  updated = (await getItem(id)) ?? updated;
  return updated;
}

/** Daily safety net: retry captures whose AI filing or Supermemory sync failed. */
export async function sweepEnrichment(limit = 40) {
  const conds: string[] = [];
  if (features.llm) conds.push(`(enrich_state <> 'done' and enrich_attempts < 3)`);
  if (features.supermemory) conds.push(`(sm_doc_id is null)`);
  if (!conds.length) return 0;
  const rows = await query(
    `select id from items where (${conds.join(" or ")}) and created_at < now() - interval '2 minutes'
     order by created_at desc limit $1`,
    [limit],
  );
  const ids = rows.map((r) => r.id as string).filter(isUuid);
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map((id) => enrichItem(id).catch(() => null)));
  }
  return ids.length;
}
