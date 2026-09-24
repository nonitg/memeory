import { after } from "next/server";
import { verifyWebhookSignature } from "@/lib/channels/whatsapp";
import { env, features } from "@/lib/env";
import { handleWhatsApp } from "@/lib/wa-inbound";

export const maxDuration = 120;

// Meta's one-time webhook verification handshake.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && env.wa.verifyToken && p.get("hub.verify_token") === env.wa.verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("bad signature", { status: 401 });
  }
  if (!features.whatsapp) return new Response("ok");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  // Answer Meta right away; do the work after the response.
  after(() => handleWhatsApp(payload as Parameters<typeof handleWhatsApp>[0]));
  return new Response("ok");
}
