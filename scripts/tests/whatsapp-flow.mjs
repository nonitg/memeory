// Simulates a WhatsApp conversation against the app + scripts/tests/mock-graph.mjs.
// Run via: pnpm test:whatsapp
import crypto from "node:crypto";
import fs from "node:fs";
const U = "http://localhost:3100", LOG = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seen = 0;
const sent = () => { const lines = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : []; const out = lines.slice(seen).map((l) => JSON.parse(l)); seen = lines.length; return out; };
const show = (label, msgs) => { console.log(`\n### ${label} → ${msgs.length} outbound`); for (const m of msgs) { const b = m.body; const t = b.type ?? (b.status ? "read-receipt" : "?"); const txt = b.text?.body ?? b.interactive?.body?.text ?? (b.template ? `template:${b.template.name} ${JSON.stringify(b.template.components?.[0]?.parameters?.map(p=>p.text))}` : b.reaction ? `reaction ${b.reaction.emoji}` : b.message ?? b.title ?? ""); if (t !== "read-receipt") console.log(`  [${m.path.includes("ntfy") ? "ntfy" : t}] ${String(txt).replace(/\n/g, "\n      ")}${b.interactive ? "\n      buttons: " + b.interactive.action.buttons.map((x) => x.reply.title + "=" + x.reply.id.slice(0, 12)).join(" | ") : ""}`); } };
let mid = 0;
async function inbound(msg, { from = "14165550000", secret = "sec" } = {}) {
  const payload = { entry: [{ changes: [{ value: { messages: [{ id: `wamid.in${++mid}`, from, timestamp: `${Date.now() / 1000 | 0}`, ...msg }] } }] }] };
  const raw = JSON.stringify(payload);
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const res = await fetch(`${U}/api/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body: raw });
  return res.status;
}
const cron = async (q = "") => (await fetch(`${U}/api/cron/daily${q}`, { headers: { authorization: "Bearer dev-secret" } })).json();

console.log("verify handshake:", await (await fetch(`${U}/api/whatsapp?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`)).text());
console.log("wrong verify token:", (await fetch(`${U}/api/whatsapp?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42`)).status);
console.log("bad signature:", await inbound({ type: "text", text: { body: "x" } }, { secret: "wrong" }));

let r = await cron(); await sleep(800);
console.log("\ncron (chat window closed):", JSON.stringify(r.results));
show("morning cron, no recent message", sent());

console.log("\nstranger:", await inbound({ type: "text", text: { body: "spam" } }, { from: "19995551234" })); await sleep(1200);
show("message from a stranger", sent());

await inbound({ type: "text", text: { body: "go" } }); await sleep(2500);
show('user replies "go"', sent());

await inbound({ type: "text", text: { body: "Octopuses have three hearts and blue blood" } }); await sleep(3000);
show("capture a fact", sent());

await inbound({ type: "text", text: { body: "https://www.paulgraham.com/greatwork.html" } }); await sleep(2500);
show("same link again", sent());

await inbound({ type: "text", text: { body: "? feynman" } }); await sleep(1500);
show("search", sent());

await inbound({ type: "text", text: { body: "undo" } }); await sleep(1500);
show("undo", sent());

const card = fs.readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((m) => m.body.interactive);
const due = card ? card.body.interactive.action.buttons[1].reply.id : "";
await inbound({ type: "interactive", context: { id: "wamid.mock2" }, interactive: { type: "button_reply", button_reply: { id: due, title: "✓ Got it" } } }); await sleep(1500);
show(`tap "Got it" (${due.slice(0, 10)}…)`, sent());

await inbound({ type: "text", text: { body: "help" } }); await sleep(1200);
show("help", sent());

r = await cron(); await sleep(800);
console.log("\ncron again same day:", JSON.stringify(r.results));
show("second cron same day", sent());
