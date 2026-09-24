import { SaveNow } from "@/components/save-now";
import { requireSession } from "@/lib/auth";

// Target of the browser bookmarklet: opens in a small popup, saves, closes itself.
export default async function Save({ searchParams }: PageProps<"/save">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const qs = new URLSearchParams(
    Object.entries({ url: pick("url"), title: pick("title"), text: pick("text") }).filter(([, v]) => v),
  ).toString();
  await requireSession(`/save${qs ? `?${qs}` : ""}`);
  return <SaveNow url={pick("url")} title={pick("title")} text={pick("text")} />;
}
