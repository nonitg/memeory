import { isCronAuthorized, unauthorized } from "@/lib/auth";
import { sendWeekly } from "@/lib/digest";

export const maxDuration = 300;

async function run(req: Request) {
  if (!(await isCronAuthorized(req))) return unauthorized();
  const p = new URL(req.url).searchParams;
  const res = await sendWeekly({ force: p.get("force") === "1", dryRun: p.get("dry") === "1" });
  if (p.get("dry") === "1" && p.get("html") === "1" && "html" in res) {
    return new Response(res.html as string, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return Response.json(res);
}

export const GET = run;
export const POST = run;
