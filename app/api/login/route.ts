import { NextResponse } from "next/server";
import { checkSecret, setSessionCookie } from "@/lib/auth";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const key = String(form.get("key") ?? "");
  if (!checkSecret(key)) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }
  await setSessionCookie();
  return NextResponse.redirect(new URL(next, req.url), 303);
}
