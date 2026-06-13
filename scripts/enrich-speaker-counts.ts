import { config } from "dotenv";
config({ path: ".env.local" });

import { getClient } from "../lib/elastic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES_INDEX = "languages";
const BATCH_SIZE = 500;
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "LangSafe/1.0 (https://github.com/LangSafe; endangered-language-preservation)";

// ---------------------------------------------------------------------------
// Wikidata SPARQL queries
// ---------------------------------------------------------------------------

// Query A: Languages with both glottocode (P1394) and speaker count (P1098)
const QUERY_BY_GLOTTOCODE = `
SELECT ?glottocode (MAX(?sp) AS ?speakers) WHERE {
  ?lang wdt:P1394 ?glottocode ;
        wdt:P1098 ?sp .
}
GROUP BY ?glottocode
`;

// Query B: Languages with ISO 639-3 (P220) and speaker count, but NO glottocode
// (fallback to avoid duplicates)
const QUERY_BY_ISO = `
SELECT ?iso (MAX(?sp) AS ?speakers) WHERE {
  ?lang wdt:P220 ?iso ;
        wdt:P1098 ?sp .
  FILTER NOT EXISTS { ?lang wdt:P1394 ?gc }
}
GROUP BY ?iso
`;

// ---------------------------------------------------------------------------
// SPARQL fetch helper
// ---------------------------------------------------------------------------

interface SparqlResult {
  results: {
    bindings: Array<Record<string, { type: string; value: string }>>;
  };
}

async function querySparql(query: string): Promise<SparqlResult> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`SPARQL query failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<SparqlResult>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Enrich Speaker Counts from Wikidata ===\n");

  // Step 1: Query Wikidata
  console.log("Step 1: Querying Wikidata SPARQL...");

  console.log("  Query A: Languages by Glottocode...");
  const glottocodeResult = await querySparql(QUERY_BY_GLOTTOCODE);
  const glottocodeMap = new Map<string, number>();
  for (const binding of glottocodeResult.results.bindings) {
    const code = binding.glottocode?.value;
    const speakers = parseInt(binding.speakers?.value, 10);
    if (code && !isNaN(speakers) && speakers >= 0) {
      glottocodeMap.set(code, speakers);
    }
  }
  console.log(`    → ${glottocodeMap.size} languages with speaker data`);

  // Small delay to be polite to Wikidata
  await new Promise((r) => setTimeout(r, 1000));

  console.log("  Query B: Languages by ISO 639-3 (fallback)...");
  const isoResult = await querySparql(QUERY_BY_ISO);
  const isoMap = new Map<string, number>();
  for (const binding of isoResult.results.bindings) {
    const code = binding.iso?.value;
    const speakers = parseInt(binding.speakers?.value, 10);
    if (code && !isNaN(speakers) && speakers >= 0) {
      isoMap.set(code, speakers);
    }
  }
  console.log(`    → ${isoMap.size} additional languages by ISO code`);

  const totalWikidata = glottocodeMap.size + isoMap.size;
  console.log(`  Total Wikidata entries: ${totalWikidata}\n`);

  if (totalWikidata === 0) {
    console.error("No data retrieved from Wikidata. Aborting.");
    process.exit(1);
  }

  // Step 2: Connect to ES and ensure mapping
  console.log("Step 2: Connecting to Elasticsearch...");
  const client = getClient();

  // Add speaker_count_confidence field if not already in mapping
  try {
    await client.indices.putMapping({
      index: LANGUAGES_INDEX,
      properties: {
        speaker_count_confidence: { type: "keyword" },
      },
    });
    console.log("  speaker_count_confidence field ensured in mapping.\n");
  } catch (err) {
    console.warn("  Warning: Could not update mapping (may already exist):", err);
  }

  // Step 3: Scroll all languages from ES
  console.log("Step 3: Scrolling all languages from ES...");
  const allLanguages: Array<{ glottocode: string; iso_code: string }> = [];

  let scrollId: string | undefined;
  let response = await client.search({
    index: LANGUAGES_INDEX,
    scroll: "2m",
    size: 1000,
    _source: ["glottocode", "iso_code"],
  });

  while (response.hits.hits.length > 0) {
    for (const hit of response.hits.hits) {
      const src = hit._source as { glottocode: string; iso_code: string };
      allLanguages.push({
        glottocode: hit._id as string,
        iso_code: src.iso_code || "",
      });
    }
    scrollId = response._scroll_id;
    response = await client.scroll({ scroll_id: scrollId!, scroll: "2m" });
  }

  if (scrollId) {
    await client.clearScroll({ scroll_id: scrollId }).catch(() => {});
  }

  console.log(`  ${allLanguages.length} languages in index.\n`);

  // Step 4: Build bulk updates
  console.log("Step 4: Building updates...");
  let matchedByGlottocode = 0;
  let matchedByIso = 0;
  let skipped = 0;

  const updates: Array<{
    glottocode: string;
    speaker_count: number;
    speaker_count_confidence: "high" | "medium" | "low";
  }> = [];

  for (const lang of allLanguages) {
    const byGlottocode = glottocodeMap.get(lang.glottocode);
    if (byGlottocode !== undefined) {
      updates.push({
        glottocode: lang.glottocode,
        speaker_count: byGlottocode,
        speaker_count_confidence: "medium",
      });
      matchedByGlottocode++;
      continue;
    }

    const byIso = lang.iso_code ? isoMap.get(lang.iso_code) : undefined;
    if (byIso !== undefined) {
      updates.push({
        glottocode: lang.glottocode,
        speaker_count: byIso,
        speaker_count_confidence: "low",
      });
      matchedByIso++;
      continue;
    }

    skipped++;
  }

  console.log(`  Matched by glottocode: ${matchedByGlottocode}`);
  console.log(`  Matched by ISO 639-3:  ${matchedByIso}`);
  console.log(`  No match (skipped):    ${skipped}`);
  console.log(`  Total to update:       ${updates.length}\n`);

  if (updates.length === 0) {
    console.log("Nothing to update. Done.");
    return;
  }

  // Step 5: Bulk update ES
  console.log("Step 5: Bulk updating Elasticsearch...");
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const operations = batch.flatMap((u) => [
      { update: { _index: LANGUAGES_INDEX, _id: u.glottocode } },
      {
        doc: {
          speaker_count: u.speaker_count,
          speaker_count_confidence: u.speaker_count_confidence,
        },
      },
    ]);

    const bulkResponse = await client.bulk({ operations });

    if (bulkResponse.errors) {
      const failed = bulkResponse.items.filter((item) => item.update?.error);
      totalErrors += failed.length;
      for (const item of failed.slice(0, 3)) {
        console.error(
          `    Error: ${item.update?._id}: ${JSON.stringify(item.update?.error)}`
        );
      }
    }

    const batchUpdated = bulkResponse.items.filter(
      (item) => !item.update?.error
    ).length;
    totalUpdated += batchUpdated;
    console.log(
      `    Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}: ${batchUpdated}/${batch.length} updated`
    );
  }

  await client.indices.refresh({ index: LANGUAGES_INDEX });

  // Step 6: Summary
  console.log("\n=== Summary ===");
  console.log(`  Languages in index:     ${allLanguages.length}`);
  console.log(`  Updated with speakers:  ${totalUpdated}`);
  console.log(`  Errors:                 ${totalErrors}`);
  console.log(`  Still unknown:          ${allLanguages.length - totalUpdated}`);
  console.log(
    `  Coverage:               ${((totalUpdated / allLanguages.length) * 100).toFixed(1)}%`
  );
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
