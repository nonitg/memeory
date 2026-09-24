import { Home } from "@/components/home";
import { requireSession } from "@/lib/auth";
import { env, features } from "@/lib/env";
import { listItems, nextReviewAt, remindersDue, reviewQueue, topTags } from "@/lib/items";
import { setupStatus } from "@/lib/setup";

export default async function Page({ searchParams }: PageProps<"/">) {
  await requireSession("/");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [list, review, reminders, tags, next, setup] = await Promise.all([
    listItems({ limit: 40 }),
    reviewQueue(5),
    remindersDue(),
    topTags(24),
    nextReviewAt(),
    setupStatus(),
  ]);
  return (
    <Home
      tz={env.tz}
      items={list.items}
      nextCursor={list.nextCursor}
      review={review}
      nextReviewAt={next}
      reminders={reminders}
      tags={tags}
      initialQuery={q}
      canAsk={features.llm}
      setup={{ done: setup.done, total: setup.total }}
    />
  );
}
