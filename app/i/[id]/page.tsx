import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { getItem } from "@/lib/items";

export default async function ItemPage({ params }: PageProps<"/i/[id]">) {
  const { id } = await params;
  await requireSession(`/i/${id}`);
  const item = await getItem(id);
  if (!item) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link href="/" className="inline-flex items-center gap-1.5 py-3 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Brain
      </Link>
      <ItemDetail item={item} tz={env.tz} />
    </main>
  );
}
