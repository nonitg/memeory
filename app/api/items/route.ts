import { isAuthorized, unauthorized } from "@/lib/auth";
import { listItems } from "@/lib/items";

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const p = new URL(req.url).searchParams;
  return Response.json(
    await listItems({ cursor: p.get("cursor"), kind: p.get("kind"), archived: p.get("archived") === "1" }),
  );
}
