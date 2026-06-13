import { NextRequest, NextResponse } from "next/server";
import { getLanguage } from "@/lib/elastic";
import { kvGet, kvSet, cacheKeys, TTL } from "@/lib/kv-cache";
import { generateLanguageOverview } from "@/lib/apis/overview-generator";
import type { LanguageEntry, LanguageOverview } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils/errors";
import { apiError } from "@/lib/utils/api-response";
import { getDemoLanguage, getDemoOverview } from "@/lib/demo-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ glottocode: string }> }
) {
  const { glottocode } = await params;

  try {
    // 1. Check KV cache
    const cacheKey = cacheKeys.overview(glottocode);
    const cached = await kvGet<LanguageOverview>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 2. Get language metadata (try KV first, then Elasticsearch)
    const langCacheKey = cacheKeys.language(glottocode);
    let language = await kvGet<LanguageEntry>(langCacheKey);
    if (!language) {
      language = await getLanguage(glottocode);
      if (!language) {
        const demoLanguage = getDemoLanguage(glottocode);
        if (demoLanguage) language = demoLanguage;
      }
      if (!language) {
        return apiError("Language not found", 404);
      }
    }

    // 3. Generate overview with Featherless.
    const overview = await generateLanguageOverview(language);

    // 4. Cache for 24 hours
    await kvSet(cacheKey, overview, TTL.OVERVIEW);

    return NextResponse.json(overview);
  } catch (err) {
    console.warn(
      `[/api/languages/${glottocode}/overview] Failed:`,
      getErrorMessage(err)
    );
    const demoOverview = getDemoOverview(glottocode);
    if (demoOverview) return NextResponse.json(demoOverview);
    return apiError("Failed to generate language overview", 500);
  }
}
