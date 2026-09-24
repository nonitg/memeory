"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";

export function CaptureBox({
  value,
  onChange,
  onSubmit,
  flash,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  flash: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a comfortable height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);

  // Desktop: be ready to type the moment the page opens.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
    const focus = () => ref.current?.focus();
    window.addEventListener("brain:focus-capture", focus);
    return () => window.removeEventListener("brain:focus-capture", focus);
  }, []);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    ref.current?.focus();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`relative rounded-3xl border bg-card shadow-soft transition-colors focus-within:border-accent/60 ${
        flash ? "border-good/60" : "border-line"
      }`}
    >
      <label htmlFor="capture" className="sr-only">
        Capture a thought, link, or fact
      </label>
      <textarea
        id="capture"
        ref={ref}
        rows={2}
        value={value}
        enterKeyHint="send"
        autoComplete="off"
        placeholder="Dump anything. A thought, a link, a fact, “remind me to…”"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="block w-full resize-none bg-transparent px-5 pt-4 text-[17px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
        <p className="hidden text-xs text-faint sm:block">
          <kbd className="font-sans">↵</kbd> save · <kbd className="font-sans">⇧↵</kbd> new line ·{" "}
          <kbd className="font-sans">/</kbd> search
        </p>
        <p className="text-xs text-faint sm:hidden">AI files it for you</p>
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Save"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white transition active:scale-95 disabled:bg-line disabled:text-faint"
        >
          Save <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );
}
