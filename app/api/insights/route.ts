import { NextRequest, NextResponse } from "next/server";
import { getSignificantTerms } from "@/lib/elastic";
import { kvGet, kvSet, cacheKeys, hashQuery, TTL } from "@/lib/kv-cache";
import { getErrorMessage } from "@/lib/utils/errors";
import { DEMO_SIGNIFICANT_TERMS } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const language_code = params.get("language_code") || undefined;
  const source_url = params.get("source_url") || undefined;
  const cluster = params.get("cluster") || undefined;
  const size = params.get("size") ? parseInt(params.get("size")!, 10) : undefined;

  const qHash = hashQuery({ language_code, source_url, cluster, size: size?.toString() });
  const cacheKey = cacheKeys.insights(qHash);
  const cached = await kvGet(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const result = await getSignificantTerms({
      language_code,
      source_url,
      cluster,
      size,
    });
    kvSet(cacheKey, result, TTL.STATS);
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[/api/insights] Elastic unavailable, using demo data:", getErrorMessage(err));
    return NextResponse.json(DEMO_SIGNIFICANT_TERMS);
  }
}
