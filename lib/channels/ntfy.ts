import { env } from "../env";
import type { Item } from "../types";

// ntfy.sh: free push notifications to the ntfy iPhone app. Anyone who knows the
// topic can read it, so NTFY_TOPIC must be long and random, and messages carry
// titles only, never secrets.
type NtfyAction = { action: "view" | "http"; label: string; url: string; method?: string; clear?: boolean };

export async function ntfy(msg: {
  title: string;
  message: string;
  click?: string;
  tags?: string[];
  actions?: NtfyAction[];
  delay?: string;
  priority?: number;
}) {
  const res = await fetch(env.ntfyServer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: env.ntfyTopic, ...msg, message: msg.message.slice(0, 3900) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Timed reminders ("call mom at 5pm") get an exact-time push, up to 3 days ahead. */
export async function scheduleReminderPush(item: Item) {
  if (!item.remindAt) return;
  const at = new Date(item.remindAt).getTime();
  const ahead = at - Date.now();
  if (ahead < 60_000 || ahead > 3 * 24 * 60 * 60 * 1000) return;
  await ntfy({
    title: `📌 ${item.title}`,
    message: item.summary ?? item.body ?? "Reminder",
    click: `${env.appUrl}/i/${item.id}`,
    delay: String(Math.floor(at / 1000)),
    priority: 4,
  });
}
