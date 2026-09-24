"use client";

import { Check, Copy, LoaderCircle, Send, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label = "Copy", fetchKey }: { value?: string; label?: string; fetchKey?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        let v = value ?? "";
        if (fetchKey) {
          const res = await fetch("/api/key", { method: "POST" });
          v = (await res.json()).key ?? "";
        }
        await navigator.clipboard.writeText(v);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-line bg-card px-2.5 text-xs font-medium text-muted hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5 text-good" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Code({ children, copy }: { children: string; copy?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed text-ink">{children}</code>
      {copy !== false && <CopyButton value={children} />}
    </div>
  );
}

/** React refuses javascript: hrefs, so the bookmarklet's href is set after mount. */
export function Bookmarklet({ appUrl }: { appUrl: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const code = `javascript:(()=>{const s=String(getSelection()).trim().slice(0,4000);window.open('${appUrl}/save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+(s?'&text='+encodeURIComponent(s):''),'brain','popup,width=420,height=340')})()`;
    ref.current?.setAttribute("href", code);
  }, [appUrl]);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      draggable
      className="inline-flex cursor-grab items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-soft active:cursor-grabbing"
    >
      ＋ Brain
    </a>
  );
}

type Result = { channel: string; status: string; detail?: string };

export function DigestControls() {
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const run = async (mode: "preview" | "send") => {
    setBusy(mode);
    try {
      const res = await fetch(`/api/cron/daily?${mode === "preview" ? "dry=1" : "force=1"}`, { method: "POST" });
      const json = await res.json();
      if (mode === "preview") {
        setPreview(
          json.empty ? "Nothing to send yet. Save a few things, or wait for something to come due." : [json.whatsapp, ...(json.review ?? [])].join("\n\n— — —\n\n"),
        );
      } else setResults(json.results ?? []);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run("preview")} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-medium text-muted hover:text-ink">
          {busy === "preview" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview today&apos;s digest
        </button>
        <button onClick={() => run("send")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white">
          {busy === "send" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send it now
        </button>
      </div>
      {preview && <pre className="whitespace-pre-wrap rounded-2xl border border-line bg-canvas p-4 font-sans text-sm text-ink">{preview}</pre>}
      {results && (
        <ul className="space-y-1 text-sm">
          {results.length === 0 && <li className="text-muted">No channels are connected yet.</li>}
          {results.map((r) => (
            <li key={r.channel} className={r.status === "failed" ? "text-danger" : r.status === "skipped" ? "text-muted" : "text-good"}>
              {r.channel}: {r.status}
              {r.detail ? ` · ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
