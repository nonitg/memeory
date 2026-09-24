// Fetch a page's title and description so links get real names and better tags.
// Best-effort with a hard timeout; a slow site never slows down saving.

export type LinkMeta = { title: string | null; description: string | null; site: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v ? decode(v) || null : null;
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const dec = new TextDecoder();
    while (html.length < 300_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => undefined);
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    return {
      title: metaContent(html, "og:title") ?? (titleTag ? decode(titleTag) || null : null),
      description: metaContent(html, "og:description") ?? metaContent(html, "description"),
      site: metaContent(html, "og:site_name"),
    };
  } catch {
    return null;
  }
}
