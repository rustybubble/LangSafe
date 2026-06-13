import { NextRequest, NextResponse } from "next/server";
import { getGrammarStats } from "@/lib/elastic";
import { kvGet, kvSet, cacheKeys, TTL } from "@/lib/kv-cache";
import { getErrorMessage } from "@/lib/utils/errors";
import { getDemoGrammarStats } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const language_code = request.nextUrl.searchParams.get("language_code") || undefined;

  const cacheKey = cacheKeys.grammarStats(language_code);
  const cached = await kvGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const stats = await getGrammarStats(language_code);
    kvSet(cacheKey, stats, TTL.STATS);
    return NextResponse.json(stats);
  } catch (err) {
    console.warn("[/api/grammar/stats] Elastic unavailable, using demo data:", getErrorMessage(err));
    return NextResponse.json(getDemoGrammarStats());
  }
}
