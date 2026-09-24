import { askBrain } from "@/lib/ask";
import { isAuthorized, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const { q } = (await req.json().catch(() => ({}))) as { q?: string };
  if (!q?.trim()) return Response.json({ error: "q required" }, { status: 400 });
  return Response.json(await askBrain(q.trim().slice(0, 500)));
}
