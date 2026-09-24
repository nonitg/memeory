import { env } from "./env";
import type { Item } from "./types";

// Supermemory is the semantic layer: it reads full articles behind links and
// finds things by meaning. Postgres stays the source of truth, so this is
// best-effort and never blocks a capture.
const BASE = "https://api.supermemory.ai";

async function sm<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "POST",
    headers: { Authorization: `Bearer ${env.supermemoryKey}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 8000),
  });
  if (!res.ok) throw new Error(`Supermemory ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function smAdd(item: Item): Promise<string> {
  const isLink = !!item.url && (!item.body || item.body.length < 400);
  const content = isLink
    ? item.url!
    : [item.title, item.body, item.url].filter(Boolean).join("\n\n");
  const metadata: Record<string, string | string[]> = {
    itemId: item.id,
    kind: item.kind,
    source: item.source,
    title: item.title.slice(0, 200),
  };
  if (item.tags.length) metadata.tags = item.tags;
  if (isLink && item.body) metadata.note = item.body.slice(0, 500);
  const res = await sm<{ id: string }>("/v3/documents", {
    body: {
      content,
      containerTag: env.supermemoryTag,
      customId: item.id,
      metadata,
      documentDate: item.createdAt,
    },
  });
  return res.id;
}

type SmResult = {
  similarity?: number;
  metadata?: Record<string, unknown> | null;
  documents?: { metadata?: Record<string, unknown> | null }[];
};

export async function smSearch(q: string, limit = 12): Promise<{ itemId: string; similarity: number }[]> {
  const res = await sm<{ results?: SmResult[] }>("/v4/search", {
    body: {
      q,
      containerTag: env.supermemoryTag,
      limit,
      searchMode: "hybrid",
      include: { documents: true },
    },
    timeoutMs: 3000,
  });
  const best = new Map<string, number>();
  for (const r of res.results ?? []) {
    const id =
      (r.metadata?.itemId as string | undefined) ??
      (r.documents?.find((d) => d.metadata?.itemId)?.metadata?.itemId as string | undefined);
    if (!id) continue;
    best.set(id, Math.max(best.get(id) ?? 0, r.similarity ?? 0.5));
  }
  return [...best.entries()].map(([itemId, similarity]) => ({ itemId, similarity }));
}

export async function smDelete(docId: string) {
  await sm(`/v3/documents/${encodeURIComponent(docId)}`, { method: "DELETE" }).catch(() => undefined);
}

export async function smPing(): Promise<boolean> {
  try {
    await sm("/v4/search", { body: { q: "ping", containerTag: env.supermemoryTag, limit: 1 }, timeoutMs: 4000 });
    return true;
  } catch {
    return false;
  }
}
