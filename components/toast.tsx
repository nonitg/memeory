"use client";

import { useEffect } from "react";

export type ToastState = {
  id: number;
  text: string;
  tone?: "default" | "error";
  action?: { label: string; run: () => void };
  onExpire?: () => void;
};

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      toast.onExpire?.();
      onDone();
    }, toast.action ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        key={toast.id}
        role="status"
        className={`animate-rise pointer-events-auto flex max-w-md items-center gap-3 rounded-full py-2.5 pl-5 pr-2.5 text-sm shadow-lg ${
          toast.tone === "error" ? "bg-danger text-white" : "bg-ink text-canvas"
        }`}
      >
        <span className="min-w-0 truncate">{toast.text}</span>
        {toast.action ? (
          <button
            className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25"
            onClick={() => {
              toast.action!.run();
              onDone();
            }}
          >
            {toast.action.label}
          </button>
        ) : (
          <span className="w-2" />
        )}
      </div>
    </div>
  );
}
