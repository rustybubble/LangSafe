import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { getClient } from "../lib/elastic";
import type { LanguageEntry } from "../lib/types";
import { getErrorMessage } from "../lib/utils/errors.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const LANGUAGES_INDEX = "languages";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "languages.geojson");
const R2_KEY = "map-data/languages.geojson";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GeoJSONFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    g: string;   // glottocode
    n: string;   // name
    s: string;   // endangerment_status
    l: number;   // endangerment_level
    sp: number;  // speaker_count
    m: string;   // macroarea
    f: string;   // language_family
    iso: string; // iso_code
    v: number;   // vocabulary_entries (preservation)
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🗺️  LangSafe — Generate Map Data\n");

  // Validate env
  if (!process.env.ELASTIC_URL || !process.env.ELASTIC_API_KEY) {
    console.error("❌ Missing ELASTIC_URL or ELASTIC_API_KEY in .env.local");
    process.exit(1);
  }

  const client = getClient();

  // Fetch all languages from Elastic
  console.log("📥 Fetching all languages from Elastic...");
  const response = await client.search<LanguageEntry>({
    index: LANGUAGES_INDEX,
    size: 10000,
    _source: [
      "glottocode",
      "name",
      "iso_code",
      "latitude",
      "longitude",
      "endangerment_status",
      "endangerment_level",
      "speaker_count",
      "macroarea",
      "language_family",
      "preservation_status.vocabulary_entries",
    ],
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  console.log(`  Found ${total} languages in index`);

  // Build GeoJSON features
  const features: GeoJSONFeature[] = [];
  const levelCounts: Record<number, number> = {};
  let skipped = 0;

  for (const hit of response.hits.hits) {
    const src = hit._source;
    if (!src) continue;

    // Skip languages without coordinates
    if (src.latitude == null || src.longitude == null) {
      skipped++;
      continue;
    }

    const level = src.endangerment_level ?? 0;
    levelCounts[level] = (levelCounts[level] ?? 0) + 1;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [src.longitude, src.latitude],
      },
      properties: {
        g: src.glottocode,
        n: src.name,
        s: src.endangerment_status,
        l: level,
        sp: src.speaker_count ?? 0,
        m: src.macroarea,
        f: src.language_family,
        iso: src.iso_code || "",
        v: src.preservation_status?.vocabulary_entries ?? 0,
      },
    });
  }

  const geojson: GeoJSONCollection = {
    type: "FeatureCollection",
    features,
  };

  // Write to public/data/
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const json = JSON.stringify(geojson);
  writeFileSync(OUTPUT_FILE, json);

  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`\n📦 Generated ${OUTPUT_FILE}`);
  console.log(`   Features: ${features.length}`);
  console.log(`   Skipped (no coords): ${skipped}`);
  console.log(`   File size: ${sizeKB} KB`);

  // Breakdown by endangerment level
  console.log("\n   By endangerment level:");
  const levelLabels: Record<number, string> = {
    2: "Vulnerable",
    3: "Definitely Endangered",
    4: "Severely Endangered",
    5: "Critically Endangered",
    6: "Extinct",
  };
  for (const [level, count] of Object.entries(levelCounts).sort(
    ([a], [b]) => Number(a) - Number(b)
  )) {
    const label = levelLabels[Number(level)] || `Level ${level}`;
    console.log(`     ${label}: ${count}`);
  }

  // Optional: upload to R2
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  if (workerUrl) {
    console.log("\n📤 Uploading to Cloudflare R2...");
    try {
      const uploadRes = await fetch(`${workerUrl}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Filename": R2_KEY,
        },
        body: json,
        signal: AbortSignal.timeout(30_000),
      });

      if (uploadRes.ok) {
        console.log(`   ✅ Uploaded to R2: ${R2_KEY}`);
      } else {
        console.warn(`   ⚠️  R2 upload failed: ${uploadRes.status}`);
      }
    } catch (err) {
      console.warn(
        `   ⚠️  R2 upload failed: ${getErrorMessage(err)}`
      );
    }
  } else {
    console.log("\n   ℹ️  CLOUDFLARE_WORKER_URL not set, skipping R2 upload");
  }

  console.log("\n✅ Done.\n");
}

main().catch((err) => {
  console.error("❌ Map data generation failed:", err);
  process.exit(1);
});
