import { isAuthorized, unauthorized } from "@/lib/auth";
import { searchItems } from "@/lib/items";

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ items: await searchItems(q.slice(0, 300)) });
}
