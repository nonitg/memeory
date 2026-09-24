import { createHmac } from "node:crypto";
import { kvGet, kvSet } from "../db";
import { safeEqual } from "../auth";
import { env } from "../env";

// Meta WhatsApp Cloud API. Free-form messages and buttons only work within 24h
// of the user's last message; outside that window we send an approved template.
async function send(payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(
    `${env.wa.graphBase}/${env.wa.graphVersion}/${env.wa.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.wa.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json.messages?.[0]?.id ?? null;
}

const to = () => env.wa.userNumber;

export function waText(body: string) {
  return send({ to: to(), type: "text", text: { body: body.slice(0, 4096), preview_url: false } });
}

export function waButtons(body: string, buttons: { id: string; title: string }[], footer?: string) {
  return send({
    to: to(),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
      },
    },
  });
}

export function waTemplate(params: string[]) {
  return send({
    to: to(),
    type: "template",
    template: {
      name: env.wa.template,
      language: { code: env.wa.templateLang },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 200) })) }]
        : [],
    },
  });
}

export function waReact(messageId: string, emoji: string) {
  return send({ to: to(), type: "reaction", reaction: { message_id: messageId, emoji } }).catch(() => null);
}

export function waMarkRead(messageId: string) {
  return send({ status: "read", message_id: messageId }).catch(() => null);
}

export function verifyWebhookSignature(raw: string, header: string | null): boolean {
  if (!env.wa.appSecret) return false; // never accept unsigned webhooks
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.wa.appSecret).update(raw).digest("hex");
  return safeEqual(header.slice(7), expected);
}

const WINDOW_KEY = "wa_last_inbound";

export async function noteInbound() {
  await kvSet(WINDOW_KEY, new Date().toISOString());
}

export async function lastInbound(): Promise<string | null> {
  return kvGet<string>(WINDOW_KEY);
}

/** True if we can still send free-form messages (with a 30 min safety margin). */
export async function windowOpen(): Promise<boolean> {
  const last = await lastInbound();
  return !!last && Date.now() - new Date(last).getTime() < 23.5 * 60 * 60 * 1000;
}
