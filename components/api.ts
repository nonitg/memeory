import type { Item, ItemAction } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    // Full page load on purpose: the session is gone, so reset all client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new ApiError("Signed out", 401);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

export type CaptureResult = { ok: boolean; duplicate: boolean; message: string; item: Item };

export const client = {
  capture: (body: { text?: string; url?: string; title?: string; source: string; client_id: string }) =>
    api<CaptureResult>("/api/capture", { method: "POST", body: JSON.stringify(body) }),
  item: (id: string) => api<{ item: Item }>(`/api/items/${id}`),
  list: (params: { cursor?: string | null; kind?: string | null; archived?: boolean }) => {
    const q = new URLSearchParams();
    if (params.cursor) q.set("cursor", params.cursor);
    if (params.kind) q.set("kind", params.kind);
    if (params.archived) q.set("archived", "1");
    return api<{ items: Item[]; nextCursor: string | null }>(`/api/items?${q}`);
  },
  act: (id: string, action: ItemAction, date?: string) =>
    api<{ item: Item }>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ action, date }) }),
  remove: (id: string) => api<{ ok: boolean; item: Item }>(`/api/items/${id}`, { method: "DELETE" }),
  search: (q: string, signal?: AbortSignal) =>
    api<{ items: Item[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
  ask: (q: string) =>
    api<{ answer: string | null; sources: Item[] }>("/api/ask", { method: "POST", body: JSON.stringify({ q }) }),
};

export function newClientId(prefix = "web"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
