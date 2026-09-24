"use client";

import { Brain, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KIND_META, KINDS, type Item, type ItemAction } from "@/lib/types";
import { ApiError, client, newClientId } from "./api";
import { CaptureBox } from "./capture-box";
import { dateShort, dayLabel, inDays } from "./format";
import { ItemRow, type Row, type RowHandlers } from "./item-row";
import { Reminders, ReviewDeck } from "./review";
import { SearchOverlay } from "./search";
import { Toast, type ToastState } from "./toast";

export type HomeProps = {
  tz: string;
  items: Item[];
  nextCursor: string | null;
  review: Item[];
  nextReviewAt: string | null;
  reminders: Item[];
  tags: { tag: string; n: number }[];
  initialQuery: string;
  canAsk: boolean;
  setup: { done: number; total: number };
};

type Outboxed = { clientId: string; text: string; at: string };
const OUTBOX = "brain.outbox.v1";

function readOutbox(): Outboxed[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]");
  } catch {
    return [];
  }
}
function writeOutbox(list: Outboxed[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(list));
  } catch {
    /* storage unavailable: capture still goes to the server */
  }
}

function tempRow(o: Outboxed, local: Row["local"]): Row {
  const firstLine = o.text.split("\n").find((l) => l.trim()) ?? o.text;
  return {
    id: o.clientId,
    source: "web",
    kind: /^https?:\/\/\S+$/.test(o.text.trim()) ? "link" : "note",
    title: firstLine.slice(0, 90),
    body: o.text,
    url: null,
    linkTitle: null,
    linkDescription: null,
    linkSite: null,
    summary: null,
    tags: [],
    actionable: false,
    status: "active",
    enrichState: "pending",
    remindAt: null,
    remindDoneAt: null,
    reviewAt: null,
    timesShown: 0,
    lastShownAt: null,
    createdAt: o.at,
    local,
  };
}

const EXAMPLES = [
  "Sam's birthday is March 3. Loves pour-over coffee",
  "Remind me to renew my passport in March",
  "Idea: a weekly walk-and-talk instead of the Friday sync",
];

const FILTERS = [null, ...KINDS, "archived"] as const;

export function Home(props: HomeProps) {
  const { tz } = props;
  const [items, setItems] = useState<Row[]>(props.items);
  const [cursor, setCursor] = useState(props.nextCursor);
  const [review, setReview] = useState(props.review);
  const [reminders, setReminders] = useState(props.reminders);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [searchOpen, setSearchOpen] = useState(!!props.initialQuery);
  const [searchSeed, setSearchSeed] = useState(props.initialQuery);
  const [reviewTotal] = useState(props.review.length);
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const say = useCallback((text: string, extra: Partial<ToastState> = {}) => {
    setToast({ id: Date.now() + Math.random(), text, ...extra });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  /** Apply a fresh copy of an item everywhere it appears. */
  const upsert = useCallback(
    (item: Item, replaceId?: string) => {
      setItems((list) => {
        const idx = list.findIndex((r) => r.id === (replaceId ?? item.id) || r.id === item.id);
        if (idx === -1) return list;
        const next = [...list];
        next[idx] = item;
        return next.filter((r, i) => i === idx || r.id !== item.id);
      });
      setReview((list) => list.map((r) => (r.id === item.id ? item : r)));
      setReminders((list) => {
        const due = item.remindAt && !item.remindDoneAt && new Date(item.remindAt) < endOfToday();
        const has = list.some((r) => r.id === item.id);
        if (due) return has ? list.map((r) => (r.id === item.id ? item : r)) : [...list, item];
        return list.filter((r) => r.id !== item.id);
      });
    },
    [],
  );

  const pollEnrichment = useCallback(
    (id: string) => {
      let tries = 0;
      const tick = async () => {
        tries++;
        try {
          const { item } = await client.item(id);
          if (item.enrichState !== "pending" || tries > 14) {
            upsert(item);
            if (item.remindAt && !item.remindDoneAt) say(`📌 Reminder set for ${dateShort(item.remindAt, tz)}`);
            return;
          }
        } catch {
          if (tries > 14) return;
        }
        setTimeout(tick, 1500);
      };
      setTimeout(tick, 1200);
    },
    [say, tz, upsert],
  );

  const send = useCallback(
    async (o: Outboxed, quiet = false) => {
      try {
        const res = await client.capture({ text: o.text, source: "web", client_id: o.clientId });
        writeOutbox(readOutbox().filter((x) => x.clientId !== o.clientId));
        if (res.duplicate) {
          setItems((list) => [res.item, ...list.filter((r) => r.id !== o.clientId && r.id !== res.item.id)]);
          if (!quiet) say(`Already saved on ${dateShort(res.item.createdAt, tz)}. It'll come back tomorrow.`);
          return;
        }
        upsert(res.item, o.clientId);
        if (!quiet)
          say("Saved", {
            action: {
              label: "Undo",
              run: () => {
                setItems((list) => list.filter((r) => r.id !== res.item.id));
                client.remove(res.item.id).catch(() => undefined);
              },
            },
          });
        if (res.item.enrichState === "pending") pollEnrichment(res.item.id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          writeOutbox(readOutbox().filter((x) => x.clientId !== o.clientId));
          setItems((list) => list.filter((r) => r.id !== o.clientId));
          say(err.message, { tone: "error" });
          return;
        }
        if (err instanceof ApiError && err.status === 401) return;
        setItems((list) => list.map((r) => (r.id === o.clientId ? { ...r, local: "queued" } : r)));
        if (!quiet) say("Offline. Kept on this device, will sync.");
      }
    },
    [pollEnrichment, say, tz, upsert],
  );

  const capture = useCallback(
    (text: string) => {
      const o: Outboxed = { clientId: newClientId(), text, at: new Date().toISOString() };
      writeOutbox([...readOutbox(), o]);
      setDraft("");
      setFlash((n) => n + 1);
      setTimeout(() => setFlash(0), 700);
      setItems((list) => [tempRow(o, "sending"), ...list]);
      send(o);
    },
    [send],
  );

  // Anything captured while offline goes up as soon as we're back.
  useEffect(() => {
    const flush = () => {
      const pending = readOutbox();
      if (!pending.length) return;
      setItems((list) => {
        const have = new Set(list.map((r) => r.id));
        return [...pending.filter((o) => !have.has(o.clientId)).map((o) => tempRow(o, "queued")).reverse(), ...list];
      });
      pending.forEach((o) => send(o, true));
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [send]);

  // Keyboard: "/" or Cmd+K to search, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchSeed("");
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadList = useCallback(async (f: (typeof FILTERS)[number], more = false) => {
    setLoadingList(true);
    try {
      const res = await client.list({
        cursor: more ? cursor : null,
        kind: f && f !== "archived" ? f : null,
        archived: f === "archived",
      });
      setItems((list) => (more ? [...list, ...res.items] : res.items));
      setCursor(res.nextCursor);
    } finally {
      setLoadingList(false);
    }
  }, [cursor]);

  const act = useCallback(
    async (item: Item, action: ItemAction, date?: string): Promise<Item | null> => {
      if (action === "got" || action === "again" || action === "archive") setReview((l) => l.filter((r) => r.id !== item.id));
      if (action === "done" || action === "tomorrow" || action === "nextweek" || action === "nextmonth")
        setReminders((l) => l.filter((r) => r.id !== item.id));
      if (action === "archive" && filter !== "archived") setItems((l) => l.filter((r) => r.id !== item.id));
      if (action === "unarchive" && filter === "archived") setItems((l) => l.filter((r) => r.id !== item.id));
      try {
        const { item: updated } = await client.act(item.id, action, date);
        if (!(action === "archive" && filter !== "archived")) upsert(updated);
        const msg: Partial<Record<ItemAction, string>> = {
          got: updated.reviewAt ? `Nice. Next look ${inDays(updated.reviewAt)}.` : "Nice.",
          again: "Okay. You'll see it again in 2 days.",
          done: "Done ✓",
          unarchive: "Restored",
        };
        if (action === "archive")
          say("Archived", {
            action: {
              label: "Undo",
              run: () => {
                client.act(item.id, "unarchive").then(({ item: back }) => {
                  setItems((l) => (l.some((r) => r.id === back.id) ? l : [back, ...l].sort(byNewest)));
                });
              },
            },
          });
        else if (updated.remindAt && !updated.remindDoneAt && ["tomorrow", "nextweek", "nextmonth", "remind"].includes(action))
          say(`📌 Reminder set for ${dateShort(updated.remindAt, tz)}`);
        else if (msg[action]) say(msg[action]!);
        return updated;
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) say("Couldn't save that change. Try again.", { tone: "error" });
        return null;
      }
    },
    [filter, say, tz, upsert],
  );

  const remove = useCallback(
    (item: Item) => {
      setItems((l) => l.filter((r) => r.id !== item.id));
      setReview((l) => l.filter((r) => r.id !== item.id));
      setReminders((l) => l.filter((r) => r.id !== item.id));
      setOpenId(null);
      const timer = setTimeout(() => {
        pendingDeletes.current.delete(item.id);
        client.remove(item.id).catch(() => say("Couldn't delete. Try again.", { tone: "error" }));
      }, 5200);
      pendingDeletes.current.set(item.id, timer);
      say("Deleted", {
        action: {
          label: "Undo",
          run: () => {
            clearTimeout(pendingDeletes.current.get(item.id));
            pendingDeletes.current.delete(item.id);
            setItems((l) => [item, ...l].sort(byNewest));
          },
        },
      });
    },
    [say],
  );

  const handlers: RowHandlers = useMemo(
    () => ({
      onAct: act,
      onDelete: remove,
      onTag: (t) => {
        setSearchSeed(`#${t}`);
        setSearchOpen(true);
      },
      onCopy: (item) => {
        navigator.clipboard
          ?.writeText([item.title, item.body !== item.title ? item.body : null, item.url].filter(Boolean).join("\n"))
          .then(() => say("Copied"));
      },
    }),
    [act, remove, say],
  );

  const groups = useMemo(() => {
    const out: { label: string; rows: Row[] }[] = [];
    for (const r of items) {
      const label = dayLabel(r.createdAt, tz);
      const last = out[out.length - 1];
      if (last?.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [items, tz]);

  const empty = !items.length && !filter && !loadingList;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-soft">
            <Brain className="h-4.5 w-4.5" strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Brain</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setSearchSeed("");
              setSearchOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-card px-3 text-sm text-muted shadow-soft hover:text-ink"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-line px-1 font-sans text-[11px] text-faint sm:inline">⌘K</kbd>
          </button>
          <Link
            href="/setup"
            aria-label="Setup"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink"
          >
            <Settings className="h-4.5 w-4.5" />
            {props.setup.done < props.setup.total && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
            )}
          </Link>
        </div>
      </header>

      <div className="space-y-4">
        <CaptureBox value={draft} onChange={setDraft} onSubmit={capture} flash={flash} />
        <Reminders items={reminders} tz={tz} onAct={act} />
        <ReviewDeck items={review} total={reviewTotal} nextAt={props.nextReviewAt} onAct={act} />
      </div>

      {empty ? (
        <section className="mt-8 rounded-3xl border border-dashed border-line px-6 py-8 text-center">
          <p className="text-[17px] font-semibold">Your brain is empty. Good place to start.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Type anything above. It gets titled, tagged, and brought back to you when it matters. Try one:
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setDraft(ex);
                  window.dispatchEvent(new Event("brain:focus-capture"));
                }}
                className="max-w-full truncate rounded-full border border-line bg-card px-4 py-1.5 text-sm text-muted hover:border-accent/40 hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
          <Link href="/setup" className="mt-6 inline-block text-sm font-medium text-accent-ink underline decoration-accent/30 underline-offset-4">
            Set up iPhone, Mac, and browser capture →
          </Link>
        </section>
      ) : (
        <>
          <nav aria-label="Filter" className="no-scrollbar -mx-4 mt-7 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {FILTERS.map((f) => {
              const label = f === null ? "All" : f === "archived" ? "Archived" : `${KIND_META[f].emoji} ${KIND_META[f].plural}`;
              const on = filter === f;
              return (
                <button
                  key={f ?? "all"}
                  onClick={() => {
                    setFilter(f);
                    setOpenId(null);
                    loadList(f);
                  }}
                  className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition ${
                    on ? "bg-ink text-canvas" : "border border-line bg-card text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className={`mt-3 transition-opacity ${loadingList ? "opacity-50" : ""}`}>
            {groups.map((g) => (
              <section key={g.label} className="mt-4">
                <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-faint" suppressHydrationWarning>
                  {g.label}
                </h3>
                <ul>
                  {g.rows.map((r) => (
                    <ItemRow
                      key={r.id}
                      item={r}
                      tz={tz}
                      open={openId === r.id}
                      onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                      handlers={handlers}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {!items.length && !loadingList && (
              <p className="px-3 py-8 text-sm text-muted">
                Nothing here yet{filter && filter !== "archived" ? ` in ${KIND_META[filter].plural.toLowerCase()}` : ""}.
              </p>
            )}
            {cursor && (
              <button
                onClick={() => loadList(filter, true)}
                disabled={loadingList}
                className="mx-auto mt-6 block rounded-full border border-line bg-card px-5 py-2 text-sm text-muted hover:text-ink"
              >
                {loadingList ? "Loading…" : "Show older"}
              </button>
            )}
          </div>
        </>
      )}

      {searchOpen && (
        <SearchOverlay
          key={searchSeed}
          initialQuery={searchSeed}
          tz={tz}
          canAsk={props.canAsk}
          tags={props.tags}
          handlers={handlers}
          onClose={() => {
            setSearchOpen(false);
            if (location.search) history.replaceState(null, "", "/");
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}

function byNewest(a: Item, b: Item) {
  return b.createdAt.localeCompare(a.createdAt);
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
