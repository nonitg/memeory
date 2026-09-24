"use client";

import { Archive, ArchiveRestore, Bell, CloudOff, Copy, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { hostOf, type Item, type ItemAction } from "@/lib/types";
import { dateShort, inDays, remindLabel, SOURCE_LABEL, timeShort } from "./format";
import { KindIcon } from "./kind";

export type Row = Item & { local?: "sending" | "queued" };

export type RowHandlers = {
  onAct: (item: Item, action: ItemAction, date?: string) => Promise<Item | null> | void;
  onDelete: (item: Item) => void;
  onTag: (tag: string) => void;
  onCopy: (item: Item) => void;
};

const URL_SPLIT = /(https?:\/\/[^\s<>"'`]+)/g;

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_SPLIT).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-accent-ink underline decoration-accent/40 underline-offset-2">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Tags({ item, onTag }: { item: Item; onTag: (t: string) => void }) {
  return (
    <>
      {item.tags.map((t) => (
        <button
          key={t}
          onClick={(e) => {
            e.stopPropagation();
            onTag(t);
          }}
          className="rounded-md px-1 text-xs text-faint first:-ml-1 hover:bg-accent-soft hover:text-accent-ink"
        >
          #{t}
        </button>
      ))}
    </>
  );
}

function Pill({
  children,
  onClick,
  href,
  danger,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  active?: boolean;
}) {
  const cls = `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition active:scale-95 ${
    danger
      ? "border-line text-danger hover:border-danger/40"
      : active
        ? "border-accent/50 bg-accent-soft text-accent-ink"
        : "border-line text-muted hover:border-faint hover:text-ink"
  }`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
        {children}
      </a>
    );
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function ItemRow({
  item,
  tz,
  open,
  onToggle,
  handlers,
  index,
}: {
  item: Row;
  tz: string;
  open: boolean;
  onToggle: () => void;
  handlers: RowHandlers;
  index?: number;
}) {
  const [remindOpen, setRemindOpen] = useState(false);
  const host = hostOf(item.url);
  const snippet = item.summary ?? (item.body && item.body !== item.title ? item.body : null);
  const pending = item.enrichState === "pending" || item.local === "sending";
  const reminder = item.remindAt && !item.remindDoneAt ? item.remindAt : null;

  return (
    <li className="animate-rise">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`flex cursor-pointer gap-3 rounded-2xl px-3 py-2.5 outline-none transition-colors hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-accent/40 ${
          open ? "bg-card shadow-soft" : ""
        } ${item.status === "archived" ? "opacity-60" : ""}`}
      >
        {index !== undefined && (
          <span className="-ml-1 mt-2.5 w-4 shrink-0 text-right text-xs tabular-nums text-faint">{index}</span>
        )}
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`min-w-0 flex-1 text-[15px] font-medium leading-snug text-ink ${open ? "" : "truncate"}`}>
              {item.title}
            </p>
            <span className="shrink-0 text-xs tabular-nums text-faint" suppressHydrationWarning>
              {timeShort(item.createdAt, tz)}
            </span>
          </div>
          {!open && (snippet || host) && (
            <p className="truncate text-sm text-muted">{[snippet, host].filter(Boolean).join(" · ")}</p>
          )}
          {(item.local === "queued" || pending || item.tags.length > 0 || reminder || item.status === "archived") && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
              {item.local === "queued" ? (
                <span className="inline-flex items-center gap-1 text-xs text-faint">
                  <CloudOff className="h-3 w-3" /> Saved on this device, will sync
                </span>
              ) : pending ? (
                <span className="shimmer rounded px-1 text-xs text-faint">organizing…</span>
              ) : (
                <Tags item={item} onTag={handlers.onTag} />
              )}
              {reminder && (
                <span className="rounded-md bg-accent-soft px-1.5 text-xs font-medium text-accent-ink" suppressHydrationWarning>
                  📌 {remindLabel(reminder, tz)}
                </span>
              )}
              {item.status === "archived" && <span className="text-xs text-faint">archived</span>}
            </div>
          )}
        </div>
      </div>

      {open && !item.local && (
        <div className="animate-rise mb-3 ml-[60px] mr-3 mt-2 space-y-3">
          {item.summary && (
            <p className="flex gap-1.5 text-sm text-muted">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              {item.summary}
            </p>
          )}
          {item.body && item.body !== item.title && (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
              <Linkify text={item.body} />
            </p>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block rounded-2xl border border-line bg-card p-3 transition hover:border-accent/40"
            >
              <div className="text-xs text-faint">{item.linkSite ?? host}</div>
              <div className="text-sm font-medium text-ink">{item.linkTitle ?? item.url}</div>
              {item.linkDescription && <div className="mt-0.5 line-clamp-2 text-sm text-muted">{item.linkDescription}</div>}
            </a>
          )}
          <p className="text-xs text-faint" suppressHydrationWarning>
            Saved {dateShort(item.createdAt, tz)} from {SOURCE_LABEL[item.source] ?? item.source}
            {item.status === "active" && item.reviewAt ? ` · next look ${inDays(item.reviewAt)}` : ""}
            {item.timesShown ? ` · seen ${item.timesShown}×` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.url && (
              <Pill href={item.url}>
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Pill>
            )}
            <Pill onClick={() => handlers.onCopy(item)}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Pill>
            <Pill active={remindOpen} onClick={() => setRemindOpen((v) => !v)}>
              <Bell className="h-3.5 w-3.5" /> {reminder ? "Change reminder" : "Remind me"}
            </Pill>
            {item.status === "active" ? (
              <Pill onClick={() => handlers.onAct(item, "archive")}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </Pill>
            ) : (
              <Pill onClick={() => handlers.onAct(item, "unarchive")}>
                <ArchiveRestore className="h-3.5 w-3.5" /> Restore
              </Pill>
            )}
            <Pill danger onClick={() => handlers.onDelete(item)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Pill>
          </div>
          {remindOpen && (
            <div className="animate-rise flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {(
                [
                  ["tomorrow", "Tomorrow"],
                  ["nextweek", "Next week"],
                  ["nextmonth", "Next month"],
                ] as const
              ).map(([a, label]) => (
                <Pill
                  key={a}
                  onClick={() => {
                    handlers.onAct(item, a);
                    setRemindOpen(false);
                  }}
                >
                  {label}
                </Pill>
              ))}
              <input
                type="date"
                aria-label="Pick a reminder date"
                className="h-8 rounded-full border border-line bg-card px-3 text-[13px] text-muted"
                onChange={(e) => {
                  if (e.target.value) {
                    handlers.onAct(item, "remind", e.target.value);
                    setRemindOpen(false);
                  }
                }}
              />
              {reminder && (
                <Pill
                  onClick={() => {
                    handlers.onAct(item, "done");
                    setRemindOpen(false);
                  }}
                >
                  Clear reminder
                </Pill>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
