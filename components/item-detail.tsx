"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { Item, ItemAction } from "@/lib/types";
import { client } from "./api";
import { dateShort } from "./format";
import { ItemRow, type RowHandlers } from "./item-row";
import { Toast, type ToastState } from "./toast";

export function ItemDetail({ item: initial, tz }: { item: Item; tz: string }) {
  const [item, setItem] = useState(initial);
  const [toast, setToast] = useState<ToastState | null>(null);
  const router = useRouter();
  const say = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const handlers: RowHandlers = useMemo(
    () => ({
      onAct: async (it: Item, action: ItemAction, date?: string) => {
        const { item: updated } = await client.act(it.id, action, date);
        setItem(updated);
        say(updated.remindAt && !updated.remindDoneAt && action !== "archive" ? `📌 Reminder set for ${dateShort(updated.remindAt, tz)}` : "Updated");
        return updated;
      },
      onDelete: async (it: Item) => {
        await client.remove(it.id);
        router.push("/");
      },
      onTag: (t: string) => router.push(`/?q=${encodeURIComponent(`#${t}`)}`),
      onCopy: (it: Item) => {
        navigator.clipboard?.writeText([it.title, it.body, it.url].filter(Boolean).join("\n")).then(() => say("Copied"));
      },
    }),
    [router, say, tz],
  );

  return (
    <>
      <ul>
        <ItemRow item={item} tz={tz} open onToggle={() => undefined} handlers={handlers} />
      </ul>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}
