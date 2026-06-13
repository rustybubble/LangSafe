import { NextRequest, NextResponse } from "next/server";
import { scrollAll } from "@/lib/elastic";
import { getErrorMessage } from "@/lib/utils/errors";
import { apiError } from "@/lib/utils/api-response";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") || "json";
  const language_code = request.nextUrl.searchParams.get("language_code") || undefined;

  try {
    const entries = await scrollAll(language_code);

    if (format === "csv") {
      // Collect all unique definition languages across all entries
      const allLangs = new Set<string>();
      for (const e of entries) {
        for (const d of e.definitions) {
          allLangs.add(d.language);
        }
      }
      // Ensure "en" comes first, then sort the rest
      const defLangs = ["en", ...[...allLangs].filter((l) => l !== "en").sort()];

      const header = [
        "id", "headword_native", "headword_romanized", "pos",
        ...defLangs.map((l) => `definitions_${l}`),
        "semantic_cluster", "audio_url",
      ].join(",");

      const rows = entries.map((e) => {
        const defColumns = defLangs.map((lang) =>
          e.definitions
            .filter((d) => d.language === lang)
            .map((d) => d.text)
            .join("; ")
        );

        return [
          e.id,
          e.headword_native,
          e.headword_romanized,
          e.pos,
          ...defColumns,
          e.semantic_cluster || "",
          e.audio_url || "",
        ]
          .map((f) => `"${String(f).replace(/"/g, '""')}"`)
          .join(",");
      });

      const csv = [header, ...rows].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            "attachment; filename=LangSafe-export.csv",
        },
      });
    }

    return NextResponse.json({ entries, total: entries.length });
  } catch (err) {
    console.error("[/api/export] Export failed:", getErrorMessage(err));
    return apiError("Export failed: " + getErrorMessage(err), 500);
  }
}
