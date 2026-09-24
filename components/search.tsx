"use client";

import { Brain, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { looksLikeQuestion, type Item } from "@/lib/types";
import { client } from "./api";
import { ItemRow, type RowHandlers } from "./item-row";

type Answer = { q: string; text: string | null; loading: boolean };

/** Mounted fresh each time it opens, so it always starts from `initialQuery`. */
export function SearchOverlay({
  initialQuery,
  tz,
  canAsk,
  tags,
  handlers,
  onClose,
}: {
  initialQuery: string;
  tz: string;
  canAsk: boolean;
  tags: { tag: string; n: number }[];
  handlers: RowHandlers;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const changeQuery = (next: string) => {
    setQ(next);
    if (next.trim() !== answer?.q) setAnswer(null);
    if (!next.trim()) setResults([]);
  };

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { items } = await client.search(term, ctrl.signal);
        setResults(items);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const ask = async () => {
    const term = q.trim();
    if (!term || !canAsk) return;
    setAnswer({ q: term, text: null, loading: true });
    try {
      const res = await client.ask(term);
      setAnswer({ q: term, text: res.answer, loading: false });
      if (res.sources.length) setResults(res.sources);
    } catch {
      setAnswer({ q: term, text: null, loading: false });
    }
  };

  const question = canAsk && looksLikeQuestion(q);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-canvas" role="dialog" aria-label="Search">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="sticky top-0 z-10 -mx-4 bg-canvas px-4 pb-3 pt-2">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-card px-4 shadow-soft focus-within:border-accent/60">
            {loading ? (
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-faint" />
            ) : (
              <Search className="h-5 w-5 shrink-0 text-faint" />
            )}
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && question) ask();
              }}
              enterKeyHint="search"
              placeholder={canAsk ? "Search, or ask a question…" : "Search everything…"}
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-faint"
            />
            <button onClick={onClose} aria-label="Close search" className="rounded-full p-1.5 text-faint hover:bg-card-hover hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {question && !answer && (
          <button
            onClick={ask}
            className="animate-rise mb-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-accent/40 px-4 py-3 text-left text-sm text-accent-ink hover:bg-accent-soft/50"
          >
            <Brain className="h-4 w-4" /> Ask your brain <span className="ml-auto text-xs text-faint">↵</span>
          </button>
        )}

        {answer && (
          <div className="animate-rise mb-4 rounded-2xl border border-accent/25 bg-card p-4 shadow-soft">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-ink">
              <Brain className="h-3.5 w-3.5" /> Answer
            </div>
            {answer.loading ? (
              <div className="shimmer h-5 w-2/3 rounded" />
            ) : (
              <p className="text-[15px] leading-relaxed text-ink">
                {answer.text ? (
                  answer.text.split(/(\[\d+\])/g).map((part, i) => {
                    const m = part.match(/^\[(\d+)\]$/);
                    const src = m ? results[Number(m[1]) - 1] : null;
                    return src ? (
                      <button
                        key={i}
                        onClick={() => setOpenId(src.id)}
                        className="mx-0.5 rounded bg-accent-soft px-1 text-xs font-semibold text-accent-ink"
                      >
                        {m![1]}
                      </button>
                    ) : (
                      part
                    );
                  })
                ) : (
                  <span className="text-muted">No answer this time. The closest matches are below.</span>
                )}
              </p>
            )}
          </div>
        )}

        {!q.trim() ? (
          <div className="space-y-4 px-1 pt-2 text-sm text-muted">
            {tags.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Your topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => changeQuery(`#${t.tag}`)}
                      className="rounded-full border border-line bg-card px-3 py-1 text-[13px] text-muted hover:border-accent/40 hover:text-ink"
                    >
                      #{t.tag} <span className="text-faint">{t.n}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-faint">
              Search matches words and meaning.{canAsk ? " End with a ? to get an answer, like “what was that pasta place?”" : ""}
            </p>
          </div>
        ) : results.length ? (
          <ol className="space-y-0.5">
            {results.map((r, i) => (
              <ItemRow
                key={r.id}
                item={r}
                tz={tz}
                index={answer?.text ? i + 1 : undefined}
                open={openId === r.id}
                onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                handlers={{
                  ...handlers,
                  onAct: async (item, action, date) => {
                    const updated = await handlers.onAct(item, action, date);
                    if (updated) setResults((rs) => rs.map((x) => (x.id === updated.id ? updated : x)));
                    return updated ?? null;
                  },
                  onTag: (t) => changeQuery(`#${t}`),
                  onDelete: (item) => {
                    setResults((rs) => rs.filter((x) => x.id !== item.id));
                    handlers.onDelete(item);
                  },
                }}
              />
            ))}
          </ol>
        ) : !loading ? (
          <p className="px-1 pt-4 text-sm text-muted">
            Nothing for “{q.trim()}” yet. Try fewer words, or a #tag.
          </p>
        ) : null}
      </div>
    </div>
  );
}
