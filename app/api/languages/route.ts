import { NextRequest, NextResponse } from "next/server";
import { searchLanguages } from "@/lib/elastic";
import { kvGet, kvSet, cacheKeys, hashQuery, TTL } from "@/lib/kv-cache";
import type { LanguageFilters, EndangermentStatus, LanguageBrowserResponse } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils/errors";
import { filterDemoLanguages } from "@/lib/demo-data";

export async function GET(request: NextRequest) {
  const filters: LanguageFilters = {};

  try {
    const params = request.nextUrl.searchParams;

    const search = params.get("search");
    if (search) filters.search = search;

    const endangerment = params.get("endangerment");
    if (endangerment) filters.endangerment = endangerment.split(",") as EndangermentStatus[];

    const macroarea = params.get("macroarea");
    if (macroarea) filters.macroarea = macroarea.split(",");

    const family = params.get("family");
    if (family) filters.family = family;

    const minSpeakers = params.get("min_speakers");
    if (minSpeakers) filters.min_speakers = Number(minSpeakers);

    const maxSpeakers = params.get("max_speakers");
    if (maxSpeakers) filters.max_speakers = Number(maxSpeakers);

    const hasPreservation = params.get("has_preservation");
    if (hasPreservation) filters.has_preservation = hasPreservation === "true";

    const sort = params.get("sort");
    if (sort) filters.sort = sort;

    const page = params.get("page");
    if (page) filters.page = Number(page);

    const limit = params.get("limit");
    if (limit) filters.limit = Number(limit);

    // Build cache key from filter params
    const qHash = hashQuery({
      search: search || undefined,
      endangerment: endangerment || undefined,
      macroarea: macroarea || undefined,
      family: family || undefined,
      min_speakers: minSpeakers || undefined,
      max_speakers: maxSpeakers || undefined,
      has_preservation: hasPreservation || undefined,
      sort: sort || undefined,
      page: page || undefined,
      limit: limit || undefined,
    });
    const cacheKey = cacheKeys.search("all", qHash);

    // Check cache
    const cached = await kvGet<LanguageBrowserResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await searchLanguages(filters);

    // Cache result
    await kvSet(cacheKey, result, TTL.SEARCH);

    return NextResponse.json(result);
  } catch (err) {
    console.warn("[/api/languages] Elastic unavailable, using demo data:", getErrorMessage(err));
    return NextResponse.json(filterDemoLanguages(filters));
  }
}
