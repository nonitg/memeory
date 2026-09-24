import { ImageResponse } from "next/og";
import { BrandIcon } from "@/lib/brand";

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size) === 512 ? 512 : 192;
  return new ImageResponse(<BrandIcon size={n} rounded={false} />, {
    width: n,
    height: n,
    headers: { "cache-control": "public, max-age=604800, immutable" },
  });
}
