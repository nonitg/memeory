// Shared between server and client. No server imports here.

export const KINDS = ["note", "idea", "link", "fact", "todo", "quote", "event"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_META: Record<Kind, { label: string; plural: string; emoji: string }> = {
  note: { label: "Note", plural: "Notes", emoji: "📝" },
  idea: { label: "Idea", plural: "Ideas", emoji: "💡" },
  link: { label: "Link", plural: "Links", emoji: "🔗" },
  fact: { label: "Fact", plural: "Facts", emoji: "📘" },
  todo: { label: "To-do", plural: "To-dos", emoji: "✅" },
  quote: { label: "Quote", plural: "Quotes", emoji: "💬" },
  event: { label: "Event", plural: "Events", emoji: "📅" },
};

export type Item = {
  id: string;
  source: string;
  kind: Kind;
  title: string;
  body: string | null;
  url: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkSite: string | null;
  summary: string | null;
  tags: string[];
  actionable: boolean;
  status: "active" | "archived";
  enrichState: "pending" | "done" | "fallback";
  remindAt: string | null;
  remindDoneAt: string | null;
  reviewAt: string | null;
  timesShown: number;
  lastShownAt: string | null;
  createdAt: string;
};

export type ItemAction =
  | "got"
  | "again"
  | "archive"
  | "unarchive"
  | "done"
  | "tomorrow"
  | "nextweek"
  | "nextmonth"
  | "remind";

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function looksLikeQuestion(q: string): boolean {
  const t = q.trim().toLowerCase();
  return t.endsWith("?") || /^(what|when|where|who|which|why|how|did|do|does|is|are|was|were|can|should)\b/.test(t);
}
