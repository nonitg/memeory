import { after } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { enrichItem } from "@/lib/enrich";
import { CaptureError, createItem } from "@/lib/items";
import { shortDate } from "@/lib/time";

export const maxDuration = 60;

// Accepts JSON, form data, or raw text, so any client (Shortcuts, curl, a
// bookmarklet) can post without fuss. Saving is instant; AI filing runs after.
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (type.includes("form")) {
    const form = Object.fromEntries(new URLSearchParams(raw));
    // curl and some clients label plain text as a form; only trust it if it has our fields.
    if (["text", "url", "note", "body", "title"].some((k) => k in form)) return form;
    return { text: raw };
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : { text: String(parsed) };
  } catch {
    return { text: raw };
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const asText = new URL(req.url).searchParams.get("format") === "text";
  const b = await readBody(req);
  try {
    const { item, duplicate } = await createItem({
      text: str(b.text ?? b.note ?? b.body),
      url: str(b.url),
      title: str(b.title),
      source: str(b.source) ?? (req.headers.get("user-agent")?.includes("Shortcuts") ? "shortcut" : "api"),
      clientId: str(b.client_id ?? b.clientId),
    });
    if (!duplicate && item.enrichState === "pending") after(() => enrichItem(item.id).catch(() => null));
    const message = duplicate ? `Already saved ${shortDate(item.createdAt)}: ${item.title}` : `✓ Saved: ${item.title}`;
    if (asText) return new Response(message, { status: duplicate ? 200 : 201 });
    return Response.json({ ok: true, duplicate, message, item }, { status: duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof CaptureError) {
      return asText
        ? new Response(`Not saved: ${err.message}`, { status: 400 })
        : Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
