"use client";

import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { client, newClientId } from "./api";

export function SaveNow({ url, title, text }: { url: string; title: string; text: string }) {
  const [state, setState] = useState<{ status: "saving" | "saved" | "error"; message: string }>(() =>
    url || text
      ? { status: "saving", message: title || url }
      : { status: "error", message: "Nothing to save. Use the button on a web page." },
  );
  const clientId = useRef(newClientId("bm"));

  useEffect(() => {
    if (!url && !text) return;
    client
      .capture({ url, title, text, source: "browser", client_id: clientId.current })
      .then((res) => {
        setState({ status: "saved", message: res.duplicate ? `Already saved. It'll come back tomorrow.` : res.item.title });
        if (window.opener) setTimeout(() => window.close(), 1400);
      })
      .catch((err) => setState({ status: "error", message: err.message ?? "Couldn't save" }));
  }, [url, title, text]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        className={`inline-flex h-14 w-14 items-center justify-center rounded-full ${
          state.status === "saved" ? "bg-good-soft text-good" : state.status === "error" ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent"
        }`}
      >
        {state.status === "saved" ? (
          <Check className="h-7 w-7" strokeWidth={2.5} />
        ) : state.status === "error" ? (
          <TriangleAlert className="h-7 w-7" />
        ) : (
          <LoaderCircle className="h-7 w-7 animate-spin" />
        )}
      </span>
      <p className="text-lg font-semibold">{state.status === "saved" ? "Saved to your brain" : state.status === "error" ? "Not saved" : "Saving…"}</p>
      <p className="line-clamp-3 max-w-xs text-sm text-muted">{state.message}</p>
      {text && state.status === "saved" && <p className="max-w-xs text-xs text-faint">Highlighted text saved with it.</p>}
    </main>
  );
}
