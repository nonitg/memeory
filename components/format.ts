// Formatting helpers that give the same answer on the server and in the
// browser, because they always use the brain's timezone, not the device's.

export function ymdIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function dayLabel(iso: string, tz: string): string {
  const d = new Date(iso);
  const today = ymdIn(tz, new Date());
  const that = ymdIn(tz, d);
  if (that === today) return "Today";
  const y = new Date(Date.now() - 86_400_000);
  if (that === ymdIn(tz, y)) return "Yesterday";
  const age = Date.now() - d.getTime();
  if (age < 6 * 86_400_000) return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(d);
  const sameYear = that.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

export function timeShort(iso: string, tz: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 12) return `${Math.round(mins / 60)}h`;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

export function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months > 1 ? "s" : ""} ago` : `${Math.round(days / 365)}y ago`;
}

export function inDays(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

export function dateShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

export const SOURCE_LABEL: Record<string, string> = {
  web: "the web app",
  ios: "iPhone",
  mac: "Mac",
  shortcut: "a Shortcut",
  browser: "the browser",
  whatsapp: "WhatsApp",
  api: "the API",
  mcp: "Claude",
};

/** "Today", "Tomorrow", or "Wed, Sep 30" for reminder chips. */
export function remindLabel(iso: string, tz: string): string {
  const that = ymdIn(tz, new Date(iso));
  if (that === ymdIn(tz, new Date())) return "Today";
  if (that === ymdIn(tz, new Date(Date.now() + 86_400_000))) return "Tomorrow";
  if (that < ymdIn(tz, new Date())) return `Since ${dateShort(iso, tz)}`;
  return dateShort(iso, tz);
}
