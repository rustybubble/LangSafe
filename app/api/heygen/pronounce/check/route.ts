import { NextRequest, NextResponse } from "next/server";

const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL ||
  "https://LangSafe-worker.lvalsote.workers.dev";
const CACHE_KEY_PREFIX = "heygen:";

/**
 * Lightweight KV-only cache probe — checks if a pronunciation video
 * already exists without triggering HeyGen generation.
 */
export async function POST(request: NextRequest) {
  try {
    const { word, language } = (await request.json()) as { word?: string; language?: string };
    if (!word) {
      return NextResponse.json({ error: "Missing: word" }, { status: 400 });
    }

    const key = `${CACHE_KEY_PREFIX}${language || "default"}:${word}`;
    const res = await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(key)}`
    );
    if (!res.ok) return NextResponse.json({ cached: false });

    const data = (await res.json()) as { value?: string };
    if (!data.value) return NextResponse.json({ cached: false });

    const parsed = JSON.parse(data.value) as {
      video_id: string;
      video_url: string;
    };
    return NextResponse.json({ ...parsed, word, cached: true });
  } catch {
    return NextResponse.json({ cached: false });
  }
}
