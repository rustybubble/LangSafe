import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@elastic/elasticsearch";
import { parse } from "csv-parse/sync";
import type { EndangermentStatus, PreservationStatus } from "../lib/types";
import { getClient, getStats } from "../lib/elastic";
import { getErrorMessage } from "../lib/utils/errors.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOTTOLOG_VERSION = "v5.1";
const BASE_URL = `https://raw.githubusercontent.com/glottolog/glottolog-cldf/${GLOTTOLOG_VERSION}/cldf`;

const LANGUAGES_INDEX = "languages";
const RESOURCES_INDEX = "language_resources";
const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// AES Endangerment Mapping (aligns with mock data in lib/api.ts levels 2-6)
// ---------------------------------------------------------------------------

const AES_MAP: Record<string, { status: EndangermentStatus; level: number }> = {
  "aes-not_endangered": { status: "not_endangered", level: 1 },
  "aes-threatened": { status: "vulnerable", level: 2 },
  "aes-shifting": { status: "definitely_endangered", level: 3 },
  "aes-moribund": { status: "severely_endangered", level: 4 },
  "aes-nearly_extinct": { status: "critically_endangered", level: 5 },
  "aes-extinct": { status: "extinct", level: 6 },
};

// ---------------------------------------------------------------------------
// Country → Contact Languages (dominant/official languages per country)
// ---------------------------------------------------------------------------

const COUNTRY_CONTACT_LANGUAGES: Record<string, string[]> = {
  // East Asia
  KR: ["Korean"], KP: ["Korean"], JP: ["Japanese"],
  CN: ["Mandarin Chinese"], TW: ["Mandarin Chinese"], MN: ["Mongolian"],

  // Southeast Asia
  TH: ["Thai"], VN: ["Vietnamese"], KH: ["Khmer"], LA: ["Lao"],
  MM: ["Burmese"], MY: ["Malay"], ID: ["Indonesian"],
  PH: ["Filipino", "English"], SG: ["Malay", "English", "Mandarin Chinese"],
  TL: ["Portuguese", "Tetum"], BN: ["Malay"],

  // South Asia
  IN: ["Hindi", "English"], PK: ["Urdu", "English"], BD: ["Bengali"],
  NP: ["Nepali"], LK: ["Sinhala", "Tamil"], BT: ["Dzongkha"], MV: ["Dhivehi"],

  // Central Asia
  KZ: ["Kazakh", "Russian"], UZ: ["Uzbek", "Russian"],
  KG: ["Kyrgyz", "Russian"], TJ: ["Tajik", "Russian"],
  TM: ["Turkmen", "Russian"], AF: ["Pashto", "Dari"],

  // Middle East
  IR: ["Persian"], IQ: ["Arabic"], SA: ["Arabic"], YE: ["Arabic"],
  OM: ["Arabic"], AE: ["Arabic"], QA: ["Arabic"], BH: ["Arabic"],
  KW: ["Arabic"], JO: ["Arabic"], LB: ["Arabic"], SY: ["Arabic"],
  IL: ["Hebrew", "Arabic"], PS: ["Arabic"], TR: ["Turkish"],

  // Europe
  RU: ["Russian"], UA: ["Ukrainian"], BY: ["Belarusian", "Russian"],
  PL: ["Polish"], CZ: ["Czech"], SK: ["Slovak"], HU: ["Hungarian"],
  RO: ["Romanian"], MD: ["Romanian", "Russian"], BG: ["Bulgarian"],
  RS: ["Serbian"], HR: ["Croatian"], BA: ["Bosnian"],
  SI: ["Slovenian"], MK: ["Macedonian"], AL: ["Albanian"], GR: ["Greek"],
  DE: ["German"], AT: ["German"], CH: ["German", "French", "Italian"],
  FR: ["French"], ES: ["Spanish"], PT: ["Portuguese"], IT: ["Italian"],
  GB: ["English"], IE: ["English", "Irish"], NL: ["Dutch"],
  BE: ["Dutch", "French"], LU: ["French", "German"],
  SE: ["Swedish"], NO: ["Norwegian"], DK: ["Danish"],
  FI: ["Finnish", "Swedish"], EE: ["Estonian"], LV: ["Latvian"], LT: ["Lithuanian"],
  IS: ["Icelandic"], MT: ["Maltese", "English"], CY: ["Greek", "Turkish"],
  GE: ["Georgian"], AM: ["Armenian"], AZ: ["Azerbaijani"],

  // Africa
  NG: ["English", "Hausa", "Yoruba", "Igbo"], GH: ["English"],
  KE: ["Swahili", "English"], TZ: ["Swahili", "English"],
  UG: ["English", "Swahili"], ET: ["Amharic"],
  SO: ["Somali"], SD: ["Arabic"], SS: ["English"],
  EG: ["Arabic"], MA: ["Arabic", "French"], DZ: ["Arabic", "French"],
  TN: ["Arabic", "French"], LY: ["Arabic"],
  ZA: ["English", "Zulu", "Xhosa", "Afrikaans"],
  MZ: ["Portuguese"], AO: ["Portuguese"],
  CD: ["French"], CG: ["French"], CM: ["French", "English"],
  CI: ["French"], SN: ["French"], ML: ["French"], BF: ["French"],
  NE: ["French"], TD: ["French", "Arabic"], CF: ["French"],
  GA: ["French"], GQ: ["Spanish"], MG: ["Malagasy", "French"],
  MW: ["English", "Chichewa"], ZM: ["English"], ZW: ["English", "Shona"],
  BW: ["English", "Tswana"], NA: ["English", "Afrikaans"],
  RW: ["Kinyarwanda", "French", "English"], BI: ["Kirundi", "French"],
  ER: ["Tigrinya", "Arabic"], DJ: ["French", "Arabic"],
  SL: ["English"], LR: ["English"], GM: ["English"],
  GW: ["Portuguese"], CV: ["Portuguese"], ST: ["Portuguese"],
  MU: ["English", "French"], SC: ["English", "French"],
  KM: ["French", "Arabic"], BJ: ["French"], TG: ["French"],
  LS: ["English", "Sotho"], SZ: ["English", "Swati"],

  // North America
  US: ["English"], CA: ["English", "French"], MX: ["Spanish"],
  GT: ["Spanish"], BZ: ["English"], HN: ["Spanish"],
  SV: ["Spanish"], NI: ["Spanish"], CR: ["Spanish"], PA: ["Spanish"],

  // Caribbean
  CU: ["Spanish"], DO: ["Spanish"], HT: ["French", "Haitian Creole"],
  JM: ["English"], TT: ["English"], PR: ["Spanish", "English"],
  GU: ["English", "Chamorro"],

  // South America
  BR: ["Portuguese"], AR: ["Spanish"], CL: ["Spanish"],
  PE: ["Spanish"], CO: ["Spanish"], VE: ["Spanish"],
  EC: ["Spanish"], BO: ["Spanish"], PY: ["Spanish", "Guarani"],
  UY: ["Spanish"], GY: ["English"], SR: ["Dutch"], GF: ["French"],

  // Oceania
  AU: ["English"], NZ: ["English", "Maori"],
  PG: ["English", "Tok Pisin"], FJ: ["English", "Fijian"],
  SB: ["English"], VU: ["English", "French", "Bislama"],
  NC: ["French"], WS: ["Samoan", "English"], TO: ["Tongan", "English"],
  PF: ["French"], FM: ["English"], MH: ["English", "Marshallese"],
  PW: ["English", "Palauan"], KI: ["English"], NR: ["English", "Nauruan"],
  TV: ["English", "Tuvaluan"],
};

// ---------------------------------------------------------------------------
// Raw CSV row types
// ---------------------------------------------------------------------------

interface RawLanguageRow {
  ID: string;
  Name: string;
  Macroarea: string;
  Latitude: string;
  Longitude: string;
  Glottocode: string;
  ISO639P3code: string;
  Level: string;
  Countries: string;
  Family_ID: string;
}

interface RawValueRow {
  ID: string;
  Language_ID: string;
  Parameter_ID: string;
  Value: string;
  Code_ID: string;
}

interface RawNameRow {
  ID: string;
  Language_ID: string;
  Name: string;
  Provider: string;
}

// ---------------------------------------------------------------------------
// Document type for the languages index
// ---------------------------------------------------------------------------

interface LanguageDocument {
  glottocode: string;
  name: string;
  iso_code: string | null;
  alternate_names: string[];
  macroarea: string;
  latitude: number;
  longitude: number;
  location?: { lat: number; lon: number };
  language_family: string;
  endangerment_status: EndangermentStatus;
  endangerment_level: number;
  speaker_count: number | null;
  countries: string[];
  contact_languages: string[];
  preservation_status: PreservationStatus;
}

// ---------------------------------------------------------------------------
// Step 1: Download CSVs from GitHub
// ---------------------------------------------------------------------------

async function fetchCSV(filename: string): Promise<string> {
  const url = `${BASE_URL}/${filename}`;
  console.log(`  Downloading ${filename}...`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const sizeMB = (Buffer.byteLength(text) / 1024 / 1024).toFixed(1);
  console.log(`  ${filename}: ${sizeMB} MB`);
  return text;
}

// ---------------------------------------------------------------------------
// Step 2: Parse CSVs
// ---------------------------------------------------------------------------

function parseCSV<T>(csv: string): T[] {
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as T[];
}

// ---------------------------------------------------------------------------
// Step 3: Build lookup maps
// ---------------------------------------------------------------------------

function buildFamilyLookup(rows: RawLanguageRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.ID, row.Name);
  }
  return map;
}

function buildEndangermentMap(
  values: RawValueRow[]
): Map<string, { status: EndangermentStatus; level: number }> {
  const map = new Map<string, { status: EndangermentStatus; level: number }>();
  for (const row of values) {
    if (row.Parameter_ID !== "aes") continue;
    const mapping = AES_MAP[row.Code_ID];
    if (mapping) {
      map.set(row.Language_ID, mapping);
    }
  }
  return map;
}

function buildAlternateNamesMap(names: RawNameRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of names) {
    if (!row.Name?.trim()) continue;
    const name = row.Name.trim();
    const existing = map.get(row.Language_ID);
    if (existing) {
      if (!existing.includes(name)) {
        existing.push(name);
      }
    } else {
      map.set(row.Language_ID, [name]);
    }
  }
  return map;
}

function resolveContactLanguages(countries: string[]): string[] {
  const langs = new Set<string>();
  for (const code of countries) {
    const contact = COUNTRY_CONTACT_LANGUAGES[code];
    if (contact) {
      for (const lang of contact) {
        langs.add(lang);
      }
    }
  }
  return [...langs];
}

// ---------------------------------------------------------------------------
// Step 4: Transform
// ---------------------------------------------------------------------------

function transformLanguages(
  languageRows: RawLanguageRow[],
  endangermentMap: Map<string, { status: EndangermentStatus; level: number }>,
  alternateNamesMap: Map<string, string[]>,
  familyLookup: Map<string, string>
): LanguageDocument[] {
  const results: LanguageDocument[] = [];
  let skippedNotLanguage = 0;
  let skippedNotEndangered = 0;
  let skippedNoEndangerment = 0;

  for (const row of languageRows) {
    // Only Level=="language" (skip families and dialects)
    if (row.Level !== "language") {
      skippedNotLanguage++;
      continue;
    }

    // Must have endangerment data
    const endangerment = endangermentMap.get(row.ID);
    if (!endangerment) {
      skippedNoEndangerment++;
      continue;
    }

    // Skip "not_endangered" (level 1)
    if (endangerment.level <= 1) {
      skippedNotEndangered++;
      continue;
    }

    // Parse countries (semicolon-separated)
    const countries = row.Countries
      ? row.Countries.split(";").map((c) => c.trim()).filter(Boolean)
      : [];

    // Parse macroarea (take first if semicolon-separated)
    const macroarea = row.Macroarea
      ? row.Macroarea.split(";")[0].trim()
      : "Unknown";

    // Parse coordinates
    const latitude = row.Latitude ? parseFloat(row.Latitude) : 0;
    const longitude = row.Longitude ? parseFloat(row.Longitude) : 0;
    const hasCoords = row.Latitude && row.Longitude;

    // Resolve family name
    const familyName = row.Family_ID
      ? (familyLookup.get(row.Family_ID) ?? "Unknown")
      : "Isolate";

    // Get alternate names, deduplicate against primary name
    const altNames = (alternateNamesMap.get(row.ID) ?? [])
      .filter((n) => n !== row.Name);

    const doc: LanguageDocument = {
      glottocode: row.Glottocode,
      name: row.Name,
      iso_code: row.ISO639P3code || null,
      alternate_names: altNames,
      macroarea,
      latitude,
      longitude,
      language_family: familyName,
      endangerment_status: endangerment.status,
      endangerment_level: endangerment.level,
      speaker_count: null,
      countries,
      contact_languages: resolveContactLanguages(countries),
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    };

    // Add geo_point only when coordinates exist
    if (hasCoords) {
      doc.location = { lat: latitude, lon: longitude };
    }

    results.push(doc);
  }

  console.log(
    `  Filtered: ${skippedNotLanguage} non-language, ` +
    `${skippedNotEndangered} not-endangered, ` +
    `${skippedNoEndangerment} no-endangerment-data`
  );

  return results;
}

// ---------------------------------------------------------------------------
// Step 5: Create Elasticsearch index
// ---------------------------------------------------------------------------

async function createIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: LANGUAGES_INDEX });
  if (exists) {
    console.log(`  Index "${LANGUAGES_INDEX}" already exists. Deleting...`);
    await client.indices.delete({ index: LANGUAGES_INDEX });
  }

  await client.indices.create({
    index: LANGUAGES_INDEX,
    settings: {
      analysis: {
        analyzer: {
          language_name: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding"],
          },
        },
      },
    },
    mappings: {
      properties: {
        glottocode: { type: "keyword" },

        name: {
          type: "text",
          analyzer: "language_name",
          fields: { keyword: { type: "keyword" } },
        },

        iso_code: { type: "keyword" },

        alternate_names: {
          type: "text",
          analyzer: "language_name",
          fields: { keyword: { type: "keyword" } },
        },

        macroarea: { type: "keyword" },

        // geo_point for geo queries (bounding box, distance)
        location: { type: "geo_point" },

        // Plain numeric lat/lng for API responses
        latitude: { type: "float" },
        longitude: { type: "float" },

        language_family: {
          type: "text",
          fields: { keyword: { type: "keyword" } },
        },

        endangerment_status: { type: "keyword" },
        endangerment_level: { type: "integer" },
        speaker_count: { type: "integer" },
        countries: { type: "keyword" },
        contact_languages: { type: "keyword" },

        preservation_status: {
          type: "object",
          properties: {
            sources_discovered: { type: "integer" },
            vocabulary_entries: { type: "integer" },
            audio_clips: { type: "integer" },
            last_pipeline_run: { type: "date" },
            coverage_percentage: { type: "float" },
          },
        },
      },
    },
  });

  console.log(`  Index "${LANGUAGES_INDEX}" created.`);
}

// ---------------------------------------------------------------------------
// Step 6: Bulk index
// ---------------------------------------------------------------------------

async function bulkIndexLanguages(
  client: Client,
  docs: LanguageDocument[]
): Promise<number> {
  let totalIndexed = 0;
  let totalErrors = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const operations = batch.flatMap((doc) => [
      { index: { _index: LANGUAGES_INDEX, _id: doc.glottocode } },
      doc,
    ]);

    const response = await client.bulk({ operations });

    if (response.errors) {
      const failed = response.items.filter((item) => item.index?.error);
      totalErrors += failed.length;
      for (const item of failed.slice(0, 3)) {
        console.error(
          `    Error: ${item.index?._id}: ${JSON.stringify(item.index?.error)}`
        );
      }
    }

    const batchIndexed = response.items.filter(
      (item) => !item.index?.error
    ).length;
    totalIndexed += batchIndexed;
    console.log(
      `    Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchIndexed}/${batch.length} indexed`
    );
  }

  if (totalErrors > 0) {
    console.warn(`  Total errors: ${totalErrors}`);
  }

  await client.indices.refresh({ index: LANGUAGES_INDEX });
  return totalIndexed;
}

// ---------------------------------------------------------------------------
// Step 7: Backfill Jeju entries in language_resources
// ---------------------------------------------------------------------------

async function backfillJeju(client: Client): Promise<void> {
  const JEJU_GLOTTOCODE = "jeju1234";

  // Check if language_resources index exists
  const exists = await client.indices.exists({ index: RESOURCES_INDEX });
  if (!exists) {
    console.log(`  Skipping backfill: "${RESOURCES_INDEX}" index does not exist.`);
    return;
  }

  // Add glottocode mapping to language_resources
  try {
    await client.indices.putMapping({
      index: RESOURCES_INDEX,
      properties: {
        glottocode: { type: "keyword" },
      },
    });
  } catch {
    // Mapping might already exist, that's fine
  }

  // Update all Jeju entries with glottocode
  const result = await client.updateByQuery({
    index: RESOURCES_INDEX,
    query: {
      term: { language_code: "jje" },
    },
    script: {
      source: "ctx._source.glottocode = params.glottocode",
      params: { glottocode: JEJU_GLOTTOCODE },
    },
    refresh: true,
  });

  console.log(
    `  Updated ${result.updated ?? 0} Jeju entries with glottocode "${JEJU_GLOTTOCODE}"`
  );

  // Sync Jeju preservation stats from language_resources to languages index
  try {
    const stats = await getStats();
    await client.update({
      index: LANGUAGES_INDEX,
      id: JEJU_GLOTTOCODE,
      doc: {
        preservation_status: {
          sources_discovered: stats.total_sources,
          vocabulary_entries: stats.total_entries,
          audio_clips: stats.total_audio_clips,
          last_pipeline_run: new Date().toISOString(),
          coverage_percentage: stats.coverage_percentage,
        },
      },
    });
    console.log(
      `  Synced Jeju preservation stats: ${stats.total_entries} entries, ${stats.total_audio_clips} audio clips`
    );
  } catch (err) {
    console.warn(
      `  Could not sync Jeju preservation stats: ${getErrorMessage(err)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n🌍 LangSafe — Glottolog CLDF Ingestion\n");

  // ── Connect to Elasticsearch ──────────────────────────────────────────────
  const node = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;

  if (!node || !apiKey) {
    console.error(
      "❌ Missing env vars. Set ELASTIC_URL and ELASTIC_API_KEY in .env.local"
    );
    process.exit(1);
  }

  const client = new Client({ node, auth: { apiKey } });

  try {
    const info = await client.info();
    console.log(
      `✅ Connected to Elasticsearch ${info.version.number} (${info.cluster_name})`
    );
  } catch (err) {
    console.error("❌ Failed to connect to Elasticsearch:", err);
    process.exit(1);
  }

  // ── Download CSVs (in parallel) ───────────────────────────────────────────
  console.log("\n📥 Downloading Glottolog CLDF data...");
  const [languagesCSV, valuesCSV, namesCSV] = await Promise.all([
    fetchCSV("languages.csv"),
    fetchCSV("values.csv"),
    fetchCSV("names.csv"),
  ]);

  // ── Parse ─────────────────────────────────────────────────────────────────
  console.log("\n📋 Parsing CSV data...");
  const languageRows = parseCSV<RawLanguageRow>(languagesCSV);
  const valueRows = parseCSV<RawValueRow>(valuesCSV);
  const nameRows = parseCSV<RawNameRow>(namesCSV);
  console.log(`  languages.csv: ${languageRows.length} rows`);
  console.log(`  values.csv:    ${valueRows.length} rows`);
  console.log(`  names.csv:     ${nameRows.length} rows`);

  // Validate expected columns
  if (languageRows.length > 0) {
    const firstRow = languageRows[0];
    const required = ["ID", "Name", "Glottocode", "Level"];
    for (const col of required) {
      if (!(col in firstRow)) {
        console.error(
          `❌ Missing expected column "${col}" in languages.csv. ` +
          `Available: ${Object.keys(firstRow).join(", ")}`
        );
        process.exit(1);
      }
    }
  }

  // ── Build lookup maps ─────────────────────────────────────────────────────
  console.log("\n🔗 Building lookup maps...");
  const familyLookup = buildFamilyLookup(languageRows);
  const endangermentMap = buildEndangermentMap(valueRows);
  const alternateNamesMap = buildAlternateNamesMap(nameRows);
  console.log(`  Family entries:       ${familyLookup.size}`);
  console.log(`  Endangerment entries: ${endangermentMap.size}`);
  console.log(`  Alternate names for:  ${alternateNamesMap.size} languages`);

  // ── Transform ─────────────────────────────────────────────────────────────
  console.log("\n🔄 Transforming to documents...");
  const documents = transformLanguages(
    languageRows,
    endangermentMap,
    alternateNamesMap,
    familyLookup
  );
  console.log(`  Resulting documents: ${documents.length}`);

  if (documents.length === 0) {
    console.error("❌ No documents to index. Check CSV data and filters.");
    process.exit(1);
  }

  // ── Create index ──────────────────────────────────────────────────────────
  console.log("\n📦 Creating Elasticsearch index...");
  await createIndex(client);

  // ── Bulk index ────────────────────────────────────────────────────────────
  console.log("\n📤 Indexing documents...");
  const indexed = await bulkIndexLanguages(client, documents);
  console.log(`  Total indexed: ${indexed}/${documents.length}`);

  // ── Backfill Jeju ─────────────────────────────────────────────────────────
  console.log("\n🔄 Backfilling Jeju entries...");
  await backfillJeju(client);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("📊 Summary\n");

  const byStatus: Record<string, number> = {};
  const byMacroarea: Record<string, number> = {};
  const byFamily: Record<string, number> = {};

  for (const doc of documents) {
    byStatus[doc.endangerment_status] =
      (byStatus[doc.endangerment_status] ?? 0) + 1;
    byMacroarea[doc.macroarea] = (byMacroarea[doc.macroarea] ?? 0) + 1;
    byFamily[doc.language_family] =
      (byFamily[doc.language_family] ?? 0) + 1;
  }

  console.log(`Indexed ${indexed} endangered languages\n`);

  console.log("By endangerment status:");
  const statusOrder: EndangermentStatus[] = [
    "vulnerable",
    "definitely_endangered",
    "severely_endangered",
    "critically_endangered",
    "extinct",
  ];
  for (const status of statusOrder) {
    console.log(`  ${status}: ${byStatus[status] ?? 0}`);
  }

  console.log("\nBy macroarea:");
  for (const [area, count] of Object.entries(byMacroarea).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${area}: ${count}`);
  }

  console.log("\nTop 10 language families:");
  const topFamilies = Object.entries(byFamily)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [family, count] of topFamilies) {
    console.log(`  ${family}: ${count}`);
  }

  console.log("\n✅ Done.\n");
}

main().catch((err) => {
  console.error("❌ Ingestion failed:", err);
  process.exit(1);
});
