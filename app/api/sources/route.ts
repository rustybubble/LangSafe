import { NextRequest, NextResponse } from "next/server";
import { getSources } from "@/lib/elastic";
import { kvGet, kvSet, cacheKeys, TTL } from "@/lib/kv-cache";
import { getErrorMessage } from "@/lib/utils/errors";
import { DEMO_SOURCES } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const language_code =
    request.nextUrl.searchParams.get("language_code") || undefined;

  const cacheKey = cacheKeys.sources(language_code);
  const cached = await kvGet<{ sources: unknown[] }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const sources = await getSources(language_code);
    const result = { sources };
    kvSet(cacheKey, result, TTL.STATS);
    return NextResponse.json(result);
  } catch (err) {
    console.warn(
      "[/api/sources] Elastic unavailable:",
      getErrorMessage(err)
    );
    return NextResponse.json({ sources: DEMO_SOURCES });
  }
}
