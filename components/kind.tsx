import { BookOpen, CalendarDays, CircleCheck, Lightbulb, Link2, Quote, StickyNote, type LucideIcon } from "lucide-react";
import type { Kind } from "@/lib/types";

const STYLE: Record<Kind, { icon: LucideIcon; cls: string }> = {
  note: { icon: StickyNote, cls: "bg-stone-500/10 text-stone-600 dark:text-stone-300" },
  idea: { icon: Lightbulb, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  link: { icon: Link2, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  fact: { icon: BookOpen, cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  todo: { icon: CircleCheck, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  quote: { icon: Quote, cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  event: { icon: CalendarDays, cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
};

export function KindIcon({ kind, size = "md" }: { kind: Kind; size?: "sm" | "md" }) {
  const { icon: Icon, cls } = STYLE[kind] ?? STYLE.note;
  const box = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-xl";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${cls}`} aria-hidden>
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} />
    </span>
  );
}
