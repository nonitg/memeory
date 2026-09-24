import { hasSession, unauthorized } from "@/lib/auth";
import { env } from "@/lib/env";

// Lets the setup page copy your key to the clipboard without printing it in the HTML.
export async function POST() {
  if (!(await hasSession())) return unauthorized();
  return Response.json({ key: env.secret }, { headers: { "cache-control": "no-store" } });
}
