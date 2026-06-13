import { NextRequest, NextResponse } from "next/server";
import { searchGrammarPatterns } from "@/lib/elastic";
import type { GrammarCategory } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils/errors";
import { searchDemoGrammar } from "@/lib/demo-data";

export async function POST(request: NextRequest) {
  let body: {
    query?: string;
    category?: GrammarCategory;
    limit?: number;
    offset?: number;
    language_code?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { query, category, limit = 20, offset = 0, language_code } = body;

  try {
    const { patterns, total } = await searchGrammarPatterns(
      query || "",
      { limit, offset, category, language_code }
    );

    return NextResponse.json({ patterns, total });
  } catch (err) {
    console.warn("[/api/grammar] Elastic unavailable, using demo data:", getErrorMessage(err));
    return NextResponse.json(
      searchDemoGrammar(query || "", { category, limit, offset, language_code })
    );
  }
}
