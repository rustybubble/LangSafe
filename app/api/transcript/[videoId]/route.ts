import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils/errors";
import { apiError } from "@/lib/utils/api-response";

const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL ||
  "https://LangSafe-worker.lvalsote.workers.dev";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return apiError("Invalid video ID", 400);
  }

  try {
    const cacheKey = `transcript:${videoId}`;
    const res = await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(cacheKey)}`
    );

    if (!res.ok) {
      return apiError("Transcript not found", 404);
    }

    const data = await res.json();
    const value = (data as { value: unknown }).value;

    if (!value) {
      return apiError("Transcript not found", 404);
    }

    return NextResponse.json(value);
  } catch (err) {
    console.error(`[/api/transcript/${videoId}] Failed:`, getErrorMessage(err));
    return apiError("Failed to fetch transcript", 500);
  }
}
