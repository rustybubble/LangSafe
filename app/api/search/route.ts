import { NextRequest, NextResponse } from "next/server";
import { search, browse } from "@/lib/elastic";
import { getErrorMessage } from "@/lib/utils/errors";
import { searchDemoVocabulary } from "@/lib/demo-data";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 20, offset = 0, cluster, language_code } = body as {
      query?: string;
      limit?: number;
      offset?: number;
      cluster?: string;
      language_code?: string;
    };

    if (!query) {
      // Browse mode: return recent entries
      try {
        const { entries, total } = await browse({ limit, offset, cluster, language_code });
        return NextResponse.json({ results: entries, total });
      } catch (err) {
        console.warn("[/api/search] Browse failed, using demo data:", getErrorMessage(err));
        const { entries, total } = searchDemoVocabulary("", {
          limit,
          offset,
          language_code,
          cluster,
        });
        return NextResponse.json({ results: entries, total });
      }
    }

    try {
      const searchResult = await search(query, { limit, offset, language_code });
      let entries = searchResult.entries;
      const { total } = searchResult;

      // Post-filter by semantic cluster if provided
      if (cluster && cluster !== "all") {
        entries = entries.filter(
          (entry) => entry.semantic_cluster === cluster
        );
      }

      return NextResponse.json({ results: entries, total });
    } catch (err) {
      console.warn("[/api/search] Elastic unavailable, using demo data:", getErrorMessage(err));
      const { entries, total } = searchDemoVocabulary(query, {
        limit,
        offset,
        language_code,
        cluster,
      });
      return NextResponse.json({ results: entries, total });
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
