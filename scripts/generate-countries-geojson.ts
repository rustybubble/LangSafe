/**
 * Downloads Natural Earth 110m Admin 0 countries GeoJSON,
 * strips all properties except ISO_A2 and NAME,
 * and writes a minimal file to public/data/countries-110m.geojson.
 *
 * Run: npx tsx scripts/generate-countries-geojson.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const OUTPUT_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "countries-110m.geojson");

interface RawFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface RawCollection {
  type: "FeatureCollection";
  features: RawFeature[];
}

async function main(): Promise<void> {
  console.log("\n🌍 LangSafe — Generate Countries GeoJSON\n");

  console.log("📥 Downloading Natural Earth countries GeoJSON...");
  console.log(`   Source: ${SOURCE_URL}`);

  const response = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const raw: RawCollection = await response.json();
  console.log(`   Downloaded ${raw.features.length} country features`);

  // Strip all properties except ISO_A2 and NAME
  const simplified = {
    type: "FeatureCollection" as const,
    features: raw.features
      .map((feature) => {
        const props = feature.properties;
        const name =
          (props["name"] as string) ||
          (props["ADMIN"] as string) ||
          (props["NAME"] as string) ||
          "Unknown";
        const iso =
          (props["ISO3166-1-Alpha-2"] as string) ||
          (props["ISO_A2"] as string) ||
          "-99";

        return {
          type: "Feature" as const,
          properties: { ISO_A2: iso, NAME: name },
          geometry: feature.geometry,
        };
      })
      .filter((f) => f.properties.ISO_A2 !== "-99"),
  };

  console.log(`   Retained ${simplified.features.length} features (filtered -99 codes)`);

  // Simplify geometries: reduce precision + thin coordinate rings
  function roundCoord(n: number): number {
    return Math.round(n * 10) / 10; // 1 decimal place (~10km, fine for country zoom)
  }

  function thinRing(ring: [number, number][], factor: number): [number, number][] {
    if (ring.length <= 4) return ring; // Keep very small polygons intact
    const thinned: [number, number][] = [];
    for (let i = 0; i < ring.length; i++) {
      if (i % factor === 0 || i === ring.length - 1) {
        thinned.push([roundCoord(ring[i][0]), roundCoord(ring[i][1])]);
      }
    }
    // Ensure ring is closed
    if (thinned.length > 0) {
      const first = thinned[0];
      const last = thinned[thinned.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        thinned.push([...first]);
      }
    }
    return thinned;
  }

  function simplifyGeometry(geom: { type: string; coordinates: unknown }): { type: string; coordinates: unknown } {
    const factor = 8; // Keep every 8th point — rough but fine for choropleth shading
    if (geom.type === "Polygon") {
      const coords = geom.coordinates as [number, number][][];
      return { type: geom.type, coordinates: coords.map((ring) => thinRing(ring, factor)) };
    }
    if (geom.type === "MultiPolygon") {
      const coords = geom.coordinates as [number, number][][][];
      return {
        type: geom.type,
        coordinates: coords.map((polygon) =>
          polygon.map((ring) => thinRing(ring, factor))
        ),
      };
    }
    return geom;
  }

  const compacted = {
    ...simplified,
    features: simplified.features.map((f) => ({
      ...f,
      geometry: simplifyGeometry(f.geometry as { type: string; coordinates: unknown }),
    })),
  };

  // Write
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const json = JSON.stringify(compacted);
  writeFileSync(OUTPUT_FILE, json);

  const sizeKB = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(`\n📦 Generated ${OUTPUT_FILE}`);
  console.log(`   File size: ${sizeKB} KB`);

  // Show a few entries
  console.log("\n   Sample countries:");
  for (const f of simplified.features.slice(0, 5)) {
    console.log(`     ${f.properties.ISO_A2} — ${f.properties.NAME}`);
  }

  console.log("\n✅ Done.\n");
}

main().catch((err) => {
  console.error("❌ Countries GeoJSON generation failed:", err);
  process.exit(1);
});
