import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";

// One secret (BRAIN_SECRET) does three jobs:
// 1. Bearer token for capture clients (iOS/Mac Shortcut, curl)
// 2. The password you paste once per device to log in to the web app
// 3. HMAC key for session cookies and one-tap action links in emails
export const SESSION_COOKIE = "brain_session";
const YEAR = 60 * 60 * 24 * 365;

function hmac(label: string, data: string): string {
  return createHmac("sha256", env.secret).update(`${label}:${data}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkSecret(candidate: string): boolean {
  return !!env.secret && safeEqual(candidate.trim(), env.secret);
}

export function makeSessionToken(): string {
  const issued = Date.now().toString(36);
  return `v1.${issued}.${hmac("session", issued)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !env.secret) return false;
  const [v, issued, sig] = token.split(".");
  return v === "v1" && !!issued && !!sig && safeEqual(sig, hmac("session", issued));
}

export async function setSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, makeSessionToken(), {
    httpOnly: true,
    secure: env.appUrl.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
  });
}

export async function hasSession(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages: bounce to /login when not signed in. */
export async function requireSession(next = "/") {
  if (!(await hasSession())) redirect(`/login?next=${encodeURIComponent(next)}`);
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** For API routes: bearer secret or a valid session cookie. */
export async function isAuthorized(req: Request): Promise<boolean> {
  const b = bearer(req);
  if (b && checkSecret(b)) return true;
  return hasSession();
}

/** Vercel Cron sends GET with CRON_SECRET. A signed-in browser may trigger it only via POST
 *  (SameSite=Lax cookies ride along on cross-site GET links, never on cross-site POSTs). */
export async function isCronAuthorized(req: Request): Promise<boolean> {
  const b = bearer(req);
  if (b && ((env.cronSecret && safeEqual(b, env.cronSecret)) || checkSecret(b))) return true;
  return req.method === "POST" && (await hasSession());
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// One-tap action links (email, push). Signed so they work without login,
// but each link can only do one thing to one item.
export type LinkAction = "got" | "again" | "archive" | "done" | "tomorrow";

export function actionToken(itemId: string, action: LinkAction): string {
  const payload = `${itemId}.${action}`;
  return `${payload}.${hmac("act", payload).slice(0, 22)}`;
}

export function readActionToken(token: string): { itemId: string; action: LinkAction } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [itemId, action, sig] = parts;
  if (!safeEqual(sig, hmac("act", `${itemId}.${action}`).slice(0, 22))) return null;
  return { itemId, action: action as LinkAction };
}

export function actionUrl(itemId: string, action: LinkAction): string {
  return `${env.appUrl}/a/${actionToken(itemId, action)}`;
}
