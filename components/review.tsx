"use client";

import { Archive, Check, RotateCcw } from "lucide-react";
import { hostOf, KIND_META, type Item, type ItemAction } from "@/lib/types";
import { ago, dateShort, inDays } from "./format";
import { KindIcon } from "./kind";

/** One card at a time: less to face, one decision per tap. */
export function ReviewDeck({
  items,
  total,
  nextAt,
  onAct,
}: {
  items: Item[];
  total: number;
  nextAt: string | null;
  onAct: (item: Item, action: ItemAction) => void;
}) {
  const item = items[0];
  if (!item) {
    if (!total) return null;
    return (
      <section className="animate-rise rounded-3xl border border-line bg-card px-5 py-4 text-sm text-muted">
        ✨ All caught up.{nextAt ? <span suppressHydrationWarning> Next one {inDays(nextAt)}.</span> : null}
      </section>
    );
  }
  const extra = item.summary ?? (item.body && item.body !== item.title ? item.body : null);
  const position = total - items.length + 1;

  return (
    <section aria-label="Remember this?" className="rounded-3xl border border-accent/25 bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Remember this?</h2>
        {total > 1 && (
          <span className="text-xs tabular-nums text-faint">
            {position} of {total}
          </span>
        )}
      </div>
      <div key={item.id} className="animate-rise">
        <div className="flex gap-3">
          <KindIcon kind={item.kind} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold leading-snug text-ink">{item.title}</p>
            {extra && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed text-muted">{extra}</p>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent-ink underline decoration-accent/30 underline-offset-2">
                {hostOf(item.url)} ↗
              </a>
            )}
            <p className="mt-2 text-xs text-faint" suppressHydrationWarning>
              {KIND_META[item.kind].label} · saved {ago(item.createdAt)}
              {item.timesShown ? ` · look #${item.timesShown + 1}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <DeckButton onClick={() => onAct(item, "again")} icon={<RotateCcw className="h-4 w-4" />} label="Again soon" />
          <DeckButton onClick={() => onAct(item, "got")} icon={<Check className="h-4 w-4" />} label="Got it" primary />
          <DeckButton onClick={() => onAct(item, "archive")} icon={<Archive className="h-4 w-4" />} label="Archive" />
        </div>
      </div>
    </section>
  );
}

function DeckButton({ onClick, icon, label, primary }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold transition active:scale-95 ${
        primary ? "bg-accent text-white" : "border border-line text-muted hover:border-faint hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function Reminders({
  items,
  tz,
  onAct,
}: {
  items: Item[];
  tz: string;
  onAct: (item: Item, action: ItemAction) => void;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Reminders" className="rounded-3xl bg-accent-soft/70 p-2">
      <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">📌 Today</h2>
      <ul>
        {items.map((r) => {
          const overdue = new Date(r.remindAt!).getTime() < new Date().setHours(0, 0, 0, 0);
          return (
            <li key={r.id} className="animate-rise flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2">
              <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                <p className="text-[15px] font-medium leading-snug text-ink">{r.title}</p>
                <p className="text-xs text-accent-ink/80" suppressHydrationWarning>
                  {overdue ? `since ${dateShort(r.remindAt!, tz)}` : "today"}
                </p>
              </div>
              <button
                onClick={() => onAct(r, "tomorrow")}
                className="ml-auto h-8 rounded-full px-3 text-[13px] font-medium text-accent-ink hover:bg-card/60 sm:ml-0"
              >
                Tomorrow
              </button>
              <button
                onClick={() => onAct(r, "done")}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-card px-3 text-[13px] font-semibold text-ink shadow-soft active:scale-95"
              >
                <Check className="h-3.5 w-3.5" /> Done
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
