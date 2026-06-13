import { NextRequest, NextResponse } from "next/server";
import { getEntriesBySource } from "@/lib/elastic";
import { getErrorMessage } from "@/lib/utils/errors";
import { searchDemoVocabulary } from "@/lib/demo-data";

export async function POST(request: NextRequest) {
  let body: {
    source_url: string;
    language_code?: string;
    limit?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { source_url, language_code, limit } = body;

  if (!source_url) {
    return NextResponse.json(
      { error: "source_url is required" },
      { status: 400 }
    );
  }

  try {
    const { entries, total } = await getEntriesBySource(source_url, {
      language_code,
      limit,
    });

    return NextResponse.json({ entries, total });
  } catch (err) {
    console.warn(
      "[/api/sources/entries] Elastic unavailable, using demo data:",
      getErrorMessage(err)
    );
    const { entries, total } = searchDemoVocabulary("", {
      source_url,
      language_code,
      limit,
    });
    return NextResponse.json({ entries, total });
  }
}
