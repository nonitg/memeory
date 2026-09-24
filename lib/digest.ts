import { generateText } from "ai";
import { actionUrl } from "./auth";
import { esc, sendEmail } from "./channels/email";
import { ntfy } from "./channels/ntfy";
import { waButtons, waTemplate, waText, windowOpen } from "./channels/whatsapp";
import { kvGet, kvSet, query } from "./db";
import { sweepEnrichment } from "./enrich";
import { env, features } from "./env";
import {
  clip,
  dueForReviewIds,
  getItems,
  itemsOnLocalDate,
  itemsSince,
  markShown,
  randomOldItems,
  remindersDue,
  topTags,
  upcomingReminders,
} from "./items";
import { writerModel } from "./llm";
import { addDays, daysAgo, localDate, prettyDate, shortDate } from "./time";
import { todoistDueToday, type TodoistTask } from "./todoist";
import { hostOf, KIND_META, type Item, type Kind } from "./types";

export type Digest = {
  date: string;
  reminders: Item[];
  tasks: TodoistTask[] | null;
  review: Item[];
  yesterday: Item[];
};

// The same 3 "remember this?" items are used by every channel today, even if
// WhatsApp delivers hours later, so nothing gets counted twice.
async function todaysReviewIds(date: string): Promise<string[]> {
  const saved = await kvGet<{ date: string; ids: string[] }>("digest_review");
  if (saved?.date === date) return saved.ids;
  const ids = await dueForReviewIds(3);
  await kvSet("digest_review", { date, ids });
  return ids;
}

export async function buildDigest(date = localDate()): Promise<Digest> {
  const [reminders, reviewIds, yesterday, tasks] = await Promise.all([
    remindersDue(),
    todaysReviewIds(date),
    itemsOnLocalDate(addDays(date, -1)),
    features.todoist ? todoistDueToday(date).catch(() => null) : Promise.resolve(null),
  ]);
  const review = (await getItems(reviewIds)).filter((i) => i.status === "active");
  return { date, reminders, tasks, review, yesterday };
}

export function isEmpty(d: Digest) {
  return !d.reminders.length && !d.review.length && !d.yesterday.length && !d.tasks?.length;
}

function countByKind(items: Item[]): string {
  const counts = new Map<Kind, number>();
  for (const i of items) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${n === 1 ? KIND_META[k].label.toLowerCase() : KIND_META[k].plural.toLowerCase()}`)
    .join(" · ");
}

export function headline(d: Digest): string {
  const parts: string[] = [];
  if (d.reminders.length) parts.push(`${d.reminders.length} reminder${d.reminders.length > 1 ? "s" : ""}`);
  if (d.tasks?.length) parts.push(`${d.tasks.length} task${d.tasks.length > 1 ? "s" : ""} due`);
  if (d.review.length) parts.push(`${d.review.length} to look at again`);
  if (!parts.length && d.yesterday.length) parts.push(`${d.yesterday.length} saved yesterday`);
  return parts.join(", ") || "all clear";
}

// ---------- renderers ----------

type Style = { b: (s: string) => string; i: (s: string) => string };
const WA: Style = { b: (s) => `*${s}*`, i: (s) => `_${s}_` };
const PLAIN: Style = { b: (s) => s, i: (s) => s };

function renderText(d: Digest, st: Style): string {
  const out: string[] = [`☀️ ${st.b(prettyDate(d.date))}`];
  if (d.reminders.length) {
    out.push("", `📌 ${st.b("Today")}`);
    for (const r of d.reminders.slice(0, 6)) out.push(`• ${r.title}`);
  }
  if (d.tasks?.length) {
    out.push("", `✅ ${st.b(`Todoist · ${d.tasks.length} due`)}`);
    for (const t of d.tasks.slice(0, 5)) out.push(`• ${t.overdue ? "⚠️ " : ""}${clip(t.content, 70)}`);
    if (d.tasks.length > 5) out.push(st.i(`+${d.tasks.length - 5} more`));
  }
  if (d.yesterday.length) {
    out.push("", `📥 ${st.b("Yesterday")} you saved ${countByKind(d.yesterday)}`);
    const todos = d.yesterday.filter((i) => i.actionable && i.status === "active");
    if (todos.length) {
      out.push("To-dos you noted:");
      for (const t of todos.slice(0, 4)) out.push(`• ${t.title}`);
    }
  }
  if (d.review.length) out.push("", `🔁 ${st.b(`${d.review.length} thing${d.review.length > 1 ? "s" : ""} to look at again`)} ↓`);
  return out.join("\n");
}

function reviewCard(i: Item, st: Style): string {
  const lines = [`${KIND_META[i.kind].emoji} ${st.b(i.title)}`];
  const extra = i.summary ?? (i.body && i.body !== i.title ? clip(i.body, 300) : null);
  if (extra) lines.push(extra);
  if (i.url) lines.push(i.url);
  const shownToday = !!i.lastShownAt && localDate(new Date(i.lastShownAt)) === localDate();
  const look = shownToday ? i.timesShown : i.timesShown + 1;
  lines.push(st.i(`Saved ${daysAgo(i.createdAt)}${look > 1 ? ` · look #${look}` : ""}`));
  return lines.join("\n");
}

function emailHtml(title: string, sections: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:13px;color:#78716c;letter-spacing:.02em">SECOND BRAIN</div>
<h1 style="font-size:22px;margin:4px 0 20px">${esc(title)}</h1>
${sections}
<p style="margin-top:28px;font-size:13px;color:#78716c"><a href="${env.appUrl}" style="color:#b45309">Open your brain</a></p>
</div></body></html>`;
}

function emailSection(heading: string, inner: string): string {
  return `<div style="background:#fff;border:1px solid #e7e5e4;border-radius:14px;padding:16px 18px;margin-bottom:14px">
<div style="font-weight:600;margin-bottom:8px">${heading}</div>${inner}</div>`;
}

function emailItem(i: Item, withActions: boolean): string {
  const link = i.url ?? `${env.appUrl}/i/${i.id}`;
  const extra = i.summary ?? (i.body && i.body !== i.title ? clip(i.body, 240) : "");
  const btn = (label: string, href: string) =>
    `<a href="${href}" style="display:inline-block;margin:8px 6px 0 0;padding:6px 12px;border-radius:999px;background:#f5f5f4;color:#1c1917;text-decoration:none;font-size:13px">${label}</a>`;
  return `<div style="padding:8px 0;border-top:1px solid #f5f5f4">
<a href="${esc(link)}" style="color:#1c1917;text-decoration:none;font-weight:500">${KIND_META[i.kind].emoji} ${esc(i.title)}</a>
${extra ? `<div style="color:#57534e;font-size:14px;margin-top:2px">${esc(extra)}</div>` : ""}
<div style="color:#a8a29e;font-size:12px;margin-top:2px">${esc(hostOf(i.url) ?? KIND_META[i.kind].label)} · saved ${esc(daysAgo(i.createdAt))}</div>
${withActions ? `${btn("✓ Got it", actionUrl(i.id, "got"))}${btn("↻ Again soon", actionUrl(i.id, "again"))}${btn("Archive", actionUrl(i.id, "archive"))}` : ""}
</div>`;
}

function dailyEmail(d: Digest): { subject: string; html: string; text: string } {
  const sections: string[] = [];
  if (d.reminders.length) sections.push(emailSection("📌 Today", d.reminders.map((r) => emailItem(r, false)).join("")));
  if (d.tasks?.length)
    sections.push(
      emailSection(
        `✅ Todoist · ${d.tasks.length} due`,
        d.tasks
          .slice(0, 8)
          .map((t) => `<div style="padding:4px 0"><a href="${t.url}" style="color:#1c1917">${t.overdue ? "⚠️ " : ""}${esc(t.content)}</a></div>`)
          .join(""),
      ),
    );
  if (d.review.length) sections.push(emailSection("🔁 Remember this?", d.review.map((r) => emailItem(r, true)).join("")));
  if (d.yesterday.length)
    sections.push(emailSection(`📥 Yesterday you saved ${countByKind(d.yesterday)}`, d.yesterday.map((r) => emailItem(r, false)).join("")));
  return {
    subject: `☀️ ${prettyDate(d.date)}: ${headline(d)}`,
    html: emailHtml(prettyDate(d.date), sections.join("")),
    text: renderText(d, PLAIN),
  };
}

// ---------- sending ----------

type ChannelResult = { channel: string; status: "sent" | "skipped" | "failed" | "knocked"; detail?: string };

async function alreadySent(channel: string, kind: string, date: string): Promise<boolean> {
  const rows = await query(`select 1 from deliveries where channel = $1 and kind = $2 and sent_on = $3::date`, [channel, kind, date]);
  return rows.length > 0;
}

async function recordSent(channel: string, kind: string, date: string, detail: Record<string, unknown> = {}) {
  await query(
    `insert into deliveries (channel, kind, sent_on, detail) values ($1, $2, $3::date, $4::jsonb)
     on conflict (channel, kind, sent_on) do update set detail = excluded.detail, created_at = now()`,
    [channel, kind, date, JSON.stringify(detail)],
  );
}

/** Full digest over WhatsApp: summary text, then one message with buttons per item. */
export async function sendWhatsAppDigest(date = localDate()): Promise<ChannelResult> {
  const d = await buildDigest(date);
  if (isEmpty(d)) {
    await waText("☀️ All clear today. Nothing due, nothing to review.");
  } else {
    await waText(renderText(d, WA));
    for (const i of d.review) {
      await waButtons(reviewCard(i, WA), [
        { id: `a:again:${i.id}`, title: "↻ Again soon" },
        { id: `a:got:${i.id}`, title: "✓ Got it" },
        { id: `a:archive:${i.id}`, title: "Archive" },
      ]);
    }
    await markShown(d.review.map((i) => i.id));
  }
  await recordSent("whatsapp", "daily", date, { review: d.review.map((i) => i.id) });
  await kvSet("wa_pending_digest", null);
  return { channel: "whatsapp", status: "sent" };
}

export async function pendingWhatsAppDigest(): Promise<string | null> {
  const p = await kvGet<{ date: string } | null>("wa_pending_digest");
  return p?.date === localDate() ? p.date : null;
}

export async function sendDaily(opts: { force?: boolean; dryRun?: boolean } = {}) {
  const date = localDate();
  const swept = opts.dryRun ? 0 : await sweepEnrichment().catch(() => 0);
  const d = await buildDigest(date);

  if (opts.dryRun) {
    return {
      date,
      empty: isEmpty(d),
      headline: headline(d),
      whatsapp: renderText(d, WA),
      review: d.review.map((i) => reviewCard(i, PLAIN)),
      emailHtml: dailyEmail(d).html,
    };
  }
  if (isEmpty(d) && !opts.force) return { date, swept, results: [{ channel: "all", status: "skipped", detail: "nothing to send" }] };

  const results: ChannelResult[] = [];
  const push = features.whatsapp || features.ntfy;

  if (features.whatsapp) {
    try {
      if (!opts.force && (await alreadySent("whatsapp", "daily", date))) {
        results.push({ channel: "whatsapp", status: "skipped", detail: "already sent today" });
      } else if (await windowOpen()) {
        results.push(await sendWhatsAppDigest(date));
      } else if (features.whatsappTemplate) {
        await waTemplate([headline(d)]);
        await kvSet("wa_pending_digest", { date });
        await recordSent("whatsapp", "knock", date);
        results.push({ channel: "whatsapp", status: "knocked", detail: "template sent; full digest arrives when you reply" });
      } else {
        results.push({
          channel: "whatsapp",
          status: "skipped",
          detail: "24h window closed and no template configured (message the bot once a day, or add WA_TEMPLATE_NAME)",
        });
      }
    } catch (err) {
      results.push({ channel: "whatsapp", status: "failed", detail: (err as Error).message });
    }
  }

  if (features.ntfy && !opts.force && (await alreadySent("ntfy", "daily", date))) {
    results.push({ channel: "ntfy", status: "skipped", detail: "already sent today" });
  } else if (features.ntfy) {
    try {
      await ntfy({
        title: `☀️ ${prettyDate(d.date)}`,
        message: [
          headline(d),
          ...d.reminders.slice(0, 3).map((r) => `📌 ${r.title}`),
          ...d.review.map((r) => `🔁 ${r.title}`),
        ].join("\n"),
        click: env.appUrl,
        tags: ["sunrise"],
      });
      await recordSent("ntfy", "daily", date);
      results.push({ channel: "ntfy", status: "sent" });
    } catch (err) {
      results.push({ channel: "ntfy", status: "failed", detail: (err as Error).message });
    }
  }

  // Email is the weekly channel, and the daily fallback when there's no push channel.
  const whatsappDelivered = results.some((r) => r.channel === "whatsapp" && (r.status === "sent" || r.status === "knocked"));
  if (features.email && (!push || (features.whatsapp && !whatsappDelivered && !features.ntfy))) {
    if (opts.force || !(await alreadySent("email", "daily", date))) {
      try {
        const m = dailyEmail(d);
        await sendEmail(m.subject, m.html, m.text);
        await recordSent("email", "daily", date);
        results.push({ channel: "email", status: "sent" });
      } catch (err) {
        results.push({ channel: "email", status: "failed", detail: (err as Error).message });
      }
    }
  }

  // Count today's "remember this?" items as shown once something visible went out.
  if (results.some((r) => r.status === "sent" && r.channel !== "whatsapp")) await markShown(d.review.map((i) => i.id));
  return { date, swept, headline: headline(d), results };
}

// ---------- weekly ----------

async function weeklyThemes(items: Item[]): Promise<string | null> {
  if (!features.llm || items.length < 3) return null;
  const list = items
    .slice(-80)
    .map((i) => `- [${i.kind}] ${i.title}${i.tags.length ? ` (${i.tags.join(", ")})` : ""}`)
    .join("\n");
  try {
    const { text } = await generateText({
      model: writerModel(),
      system:
        "You write a short, warm weekly reflection for someone's personal second brain. 2 to 3 sentences, plain text, second person. Name the 2 or 3 themes their captures cluster around and one connection or pattern they might not have noticed. No preamble, no bullet points, no flattery.",
      prompt: `This week's captures:\n${list}`,
      abortSignal: AbortSignal.timeout(60_000),
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function sendWeekly(opts: { force?: boolean; dryRun?: boolean } = {}) {
  const date = localDate();
  const [week, upcoming, fromArchive, tags] = await Promise.all([
    itemsSince(7),
    upcomingReminders(7),
    randomOldItems(3),
    topTags(8),
  ]);
  const themes = await weeklyThemes(week);
  const subject = `🧠 Your week: ${week.length} saved${upcoming.length ? `, ${upcoming.length} coming up` : ""}`;

  const byKind = new Map<Kind, Item[]>();
  for (const i of week) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const sections: string[] = [];
  if (themes) sections.push(emailSection("This week in your head", `<div style="color:#44403c;line-height:1.5">${esc(themes)}</div>`));
  if (upcoming.length)
    sections.push(
      emailSection(
        "📌 Coming up",
        upcoming
          .map((i) => `<div style="padding:4px 0"><b>${esc(shortDate(i.remindAt!))}</b> · ${esc(i.title)}</div>`)
          .join(""),
      ),
    );
  for (const [k, items] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
    sections.push(emailSection(`${KIND_META[k].emoji} ${KIND_META[k].plural} · ${items.length}`, items.map((i) => emailItem(i, false)).join("")));
  }
  if (fromArchive.length)
    sections.push(emailSection("🎲 From the archive", fromArchive.map((i) => emailItem(i, true)).join("")));
  if (tags.length)
    sections.push(
      `<p style="color:#78716c;font-size:13px">Top tags: ${tags.map((t) => `<a href="${env.appUrl}/?q=%23${t.tag}" style="color:#b45309">#${esc(t.tag)}</a>`).join(" ")}</p>`,
    );

  const text = [
    subject,
    themes ?? "",
    ...week.map((i) => `${KIND_META[i.kind].emoji} ${i.title}`),
  ].join("\n");
  const html = emailHtml(`Week of ${prettyDate(addDays(date, -6))}`, sections.join(""));
  if (opts.dryRun) return { date, subject, themes, count: week.length, html };

  if (!features.email) return { date, results: [{ channel: "email", status: "skipped", detail: "email not configured" }] };
  if (!opts.force && (await alreadySent("email", "weekly", date)))
    return { date, results: [{ channel: "email", status: "skipped", detail: "already sent today" }] };
  try {
    await sendEmail(subject, html, text);
    await recordSent("email", "weekly", date);
    return { date, results: [{ channel: "email", status: "sent" }] };
  } catch (err) {
    return { date, results: [{ channel: "email", status: "failed", detail: (err as Error).message }] };
  }
}

export async function lastDeliveries() {
  const rows = await query(
    `select channel, kind, max(created_at) as last from deliveries group by channel, kind order by last desc`,
  );
  return rows.map((r) => ({ channel: r.channel as string, kind: r.kind as string, last: new Date(r.last).toISOString() }));
}
