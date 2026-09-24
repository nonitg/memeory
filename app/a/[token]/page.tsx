import { Check } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readActionToken } from "@/lib/auth";
import { applyAction, getItem } from "@/lib/items";
import { dateShort, inDays } from "@/components/format";
import { env } from "@/lib/env";

// One-tap actions from emails. Archive asks first, because mail scanners open links.
async function confirmArchive(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const parsed = readActionToken(token);
  if (parsed?.action === "archive") await applyAction(parsed.itemId, "archive");
  redirect(`/a/${encodeURIComponent(token)}?done=1`);
}

export default async function ActionPage({ params, searchParams }: PageProps<"/a/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const parsed = readActionToken(decodeURIComponent(token));
  const item = parsed ? await getItem(parsed.itemId) : null;
  if (!parsed || !item) {
    return <Shell title="This link has expired" body="Open your brain to see the item." />;
  }

  if (parsed.action === "archive" && sp.done !== "1" && item.status !== "archived") {
    return (
      <Shell title={`Archive “${item.title}”?`} body="It stays searchable but stops coming back.">
        <form action={confirmArchive}>
          <input type="hidden" name="token" value={decodeURIComponent(token)} />
          <button className="mt-5 h-11 rounded-2xl bg-accent px-6 text-sm font-semibold text-white">
            Archive it
          </button>
        </form>
      </Shell>
    );
  }

  const updated = parsed.action === "archive" ? await getItem(item.id) : await applyAction(item.id, parsed.action);
  const done = updated ?? item;
  const text =
    parsed.action === "got"
      ? done.reviewAt
        ? `Next look ${inDays(done.reviewAt)}.`
        : "Noted."
      : parsed.action === "again"
        ? "You'll see it again in 2 days."
        : parsed.action === "archive"
          ? "Archived. Still searchable."
          : parsed.action === "tomorrow" && done.remindAt
            ? `Reminder moved to ${dateShort(done.remindAt, env.tz)}.`
            : "Done.";
  return <Shell title={done.title} body={text} ok />;
}

function Shell({ title, body, ok, children }: { title: string; body: string; ok?: boolean; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      {ok && (
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good">
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </span>
      )}
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{body}</p>
      {children}
      <Link href="/" className="mt-8 text-sm font-medium text-accent-ink underline decoration-accent/30 underline-offset-4">
        Open your brain
      </Link>
    </main>
  );
}
