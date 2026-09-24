import { waMarkRead, waReact, waText, noteInbound } from "./channels/whatsapp";
import { query } from "./db";
import { pendingWhatsAppDigest, sendWhatsAppDigest } from "./digest";
import { enrichItem } from "./enrich";
import { env } from "./env";
import { applyAction, createItem, deleteItem, searchItems } from "./items";
import { smDelete } from "./supermemory";
import { shortDate } from "./time";
import { hostOf, KIND_META, type ItemAction } from "./types";

// WhatsApp is both an inbox (send anything to save it) and a remote control.
type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
  button?: { payload?: string; text?: string };
  image?: { caption?: string };
  video?: { caption?: string };
};

type WaPayload = {
  entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[];
};

const HELP = [
  "🧠 *Your brain on WhatsApp*",
  "• Send anything: a thought, a link, a fact. I save and organize it.",
  "• *? words* searches, e.g. _? sleep article_",
  "• *today* shows today's digest",
  "• *undo* deletes the last thing you sent",
].join("\n");

export async function handleWhatsApp(payload: WaPayload) {
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of messages) {
    if (m.from.replace(/\D/g, "") !== env.wa.userNumber) continue; // only you
    await noteInbound();
    await waMarkRead(m.id);
    try {
      await handleOne(m);
    } catch (err) {
      console.error("whatsapp: handler failed", (err as Error).message);
      await waText("Something went wrong saving that. Try again in a minute.").catch(() => undefined);
    }
    // A template "knock" went out this morning: now that the window is open, deliver the real digest.
    if (m.type !== "interactive" && (await pendingWhatsAppDigest())) {
      await sendWhatsAppDigest().catch((err) => console.error("whatsapp: digest failed", err));
    }
  }
}

async function handleOne(m: WaMessage) {
  if (m.type === "interactive" && m.interactive?.button_reply) {
    const [, action, id] = m.interactive.button_reply.id.split(":");
    const item = await applyAction(id, action as ItemAction);
    await waReact(m.id, item ? (action === "archive" ? "🗄️" : action === "again" ? "🔁" : "✅") : "❓");
    return;
  }
  if (m.type === "button") return; // template quick reply: the pending digest goes out after this

  const text = (m.text?.body ?? m.image?.caption ?? m.video?.caption ?? "").trim();
  if (!text) {
    await waText("I can only save text for now. Add a caption, or type it out.");
    return;
  }
  const cmd = text.toLowerCase();

  if (["help", "?", "commands"].includes(cmd)) return void (await waText(HELP));
  if (["today", "digest", "go", "morning"].includes(cmd)) return void (await sendWhatsAppDigest());
  if (cmd === "undo") return void (await undoLast());
  if (text.startsWith("?")) return void (await replySearch(text.slice(1).trim()));

  const { item, duplicate } = await createItem({ text, source: "whatsapp", clientId: `wa-${m.id}` });
  if (duplicate) {
    await waText(`↩︎ Already saved on ${shortDate(item.createdAt)}: *${item.title}*\nI'll bring it back tomorrow.`);
    return;
  }
  const done = (await enrichItem(item.id)) ?? item;
  const lines = [`✓ Saved · ${KIND_META[done.kind].emoji} ${KIND_META[done.kind].label}`, `*${done.title}*`];
  if (done.tags.length) lines.push(done.tags.map((t) => `#${t}`).join(" "));
  if (done.remindAt) lines.push(`📌 I'll remind you ${shortDate(done.remindAt)}`);
  await waText(lines.join("\n"));
}

async function replySearch(q: string) {
  if (!q) return void (await waText("Type what to look for after the ?, e.g. _? pasta recipe_"));
  const results = (await searchItems(q, 5)).slice(0, 5);
  if (!results.length) return void (await waText(`Nothing found for "${q}".`));
  const lines = [`🔎 ${results.length} match${results.length > 1 ? "es" : ""} for "${q}"`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${KIND_META[r.kind].emoji} *${r.title}*${r.url ? ` · ${hostOf(r.url)}` : ""}`);
    lines.push(`   ${r.url ?? `${env.appUrl}/i/${r.id}`}`);
  });
  await waText(lines.join("\n"));
}

async function undoLast() {
  const rows = await query(
    `select id from items where source = 'whatsapp' and created_at > now() - interval '15 minutes'
     order by created_at desc limit 1`,
  );
  if (!rows[0]) return void (await waText("Nothing to undo from the last 15 minutes."));
  const gone = await deleteItem(rows[0].id);
  if (gone?.smDocId) await smDelete(gone.smDocId);
  await waText(`🗑️ Deleted: ${gone?.item.title ?? "last capture"}`);
}
