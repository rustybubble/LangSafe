import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "@elastic/elasticsearch";
import { searchLanguageSources, classifySourceType, DOMAIN_DENYLIST } from "../lib/apis/source-discovery";
import { getClient } from "../lib/elastic";
import type { LanguageEntry } from "../lib/types";
import { getErrorMessage } from "../lib/utils/errors.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TargetLanguage {
  glottocode: string;
  name: string;
  iso_code: string;
}

interface UniversalResourceResult {
  has_wikipedia: boolean;
  has_elp: boolean;
  has_talking_dictionary: boolean;
  has_glottolog: boolean;
}

interface PrescanResult {
  glottocode: string;
  name: string;
  sources_discovered: number;
  has_dictionary: boolean;
  has_audio: boolean;
  has_wikipedia: boolean;
  has_elp: boolean;
  has_talking_dictionary: boolean;
  has_glottolog: boolean;
  featherless_sources: number;
  error?: string;
}

// ─── Target Languages ───────────────────────────────────────────────────────
// 20 diverse endangered languages across regions and endangerment levels.
// Glottocodes follow Glottolog CLDF naming. The script verifies each exists
// in Elastic before scanning, so wrong codes are skipped gracefully.

const TARGET_LANGUAGES: TargetLanguage[] = [
  // Critically Endangered
  { glottocode: "ainu1240", name: "Ainu",       iso_code: "ain" },
  { glottocode: "livo1244", name: "Livonian",    iso_code: "liv" },
  { glottocode: "yaga1256", name: "Yaghan",      iso_code: "yag" },
  { glottocode: "cham1312", name: "Chamorro",    iso_code: "cha" },

  // Severely Endangered
  { glottocode: "hawa1245", name: "Hawaiian",    iso_code: "haw" },
  { glottocode: "cher1273", name: "Cherokee",    iso_code: "chr" },
  { glottocode: "cent2126", name: "Okinawan",    iso_code: "ryu" },
  { glottocode: "skol1241", name: "Skolt Sami",  iso_code: "sms" },

  // Definitely Endangered
  { glottocode: "maor1246", name: "Maori",       iso_code: "mri" },
  { glottocode: "arom1237", name: "Aromanian",   iso_code: "rup" },
  { glottocode: "iris1253", name: "Irish",       iso_code: "gle" },
  { glottocode: "nava1243", name: "Navajo",      iso_code: "nav" },

  // Vulnerable
  { glottocode: "wels1247", name: "Welsh",       iso_code: "cym" },
  { glottocode: "basq1248", name: "Basque",      iso_code: "eus" },
  { glottocode: "cusc1236", name: "Cusco Quechua", iso_code: "quz" },
  { glottocode: "para1311", name: "Paraguayan Guarani", iso_code: "gug" },

  // Extinct
  { glottocode: "dalm1243", name: "Dalmatian",   iso_code: "dlm" },
  { glottocode: "tasm1245", name: "Tasmanian",   iso_code: "" },

  // Additional
  { glottocode: "bret1244", name: "Breton",      iso_code: "bre" },
  { glottocode: "sard1257", name: "Sardinian",   iso_code: "srd" },
];

const LANGUAGES_INDEX = "languages";
const HEAD_TIMEOUT_MS = 8_000;
const RATE_LIMIT_DELAY_MS = 350;

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyLanguageExists(
  client: Client,
  glottocode: string
): Promise<LanguageEntry | null> {
  try {
    const res = await client.get<LanguageEntry>({
      index: LANGUAGES_INDEX,
      id: glottocode,
    });
    return res._source ?? null;
  } catch {
    return null;
  }
}

/**
 * HTTP HEAD check with timeout. Returns true if the URL responds with 2xx/3xx.
 */
async function checkUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "LangSafe/1.0 (endangered-language-preservation)",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check 4 universal linguistic resource sites in parallel.
 */
async function checkUniversalResources(
  lang: TargetLanguage
): Promise<UniversalResourceResult> {
  const wikiName = encodeURIComponent(lang.name.replace(/ /g, "_"));

  const checks = await Promise.allSettled([
    checkUrl(`https://en.wikipedia.org/wiki/${wikiName}_language`),
    lang.iso_code
      ? checkUrl(`https://endangeredlanguages.com/lang/${lang.iso_code}`)
      : Promise.resolve(false),
    checkUrl(
      `https://talkingdictionary.swarthmore.edu/${lang.name.toLowerCase().replace(/ /g, "-")}`
    ),
    checkUrl(
      `https://glottolog.org/resource/languoid/id/${lang.glottocode}`
    ),
  ]);

  const result = (i: number) =>
    checks[i].status === "fulfilled" ? checks[i].value : false;

  return {
    has_wikipedia: result(0),
    has_elp: result(1),
    has_talking_dictionary: result(2),
    has_glottolog: result(3),
  };
}

// ─── Core Scan ──────────────────────────────────────────────────────────────

const AUDIO_PATTERN =
  /audio|recording|pronunciation|talking.?dictionary|sound|listen|speech/i;

async function scanLanguage(lang: TargetLanguage): Promise<PrescanResult> {
  const base: PrescanResult = {
    glottocode: lang.glottocode,
    name: lang.name,
    sources_discovered: 0,
    has_dictionary: false,
    has_audio: false,
    has_wikipedia: false,
    has_elp: false,
    has_talking_dictionary: false,
    has_glottolog: false,
    featherless_sources: 0,
  };

  try {
    // Run universal resource checks and Featherless source planning concurrently
    const [universal, discovery] = await Promise.all([
      checkUniversalResources(lang),
      searchLanguageSources(
        `${lang.name} language online dictionary OR audio recordings OR preservation resources`,
        undefined,
        DOMAIN_DENYLIST
      ),
    ]);

    base.has_wikipedia = universal.has_wikipedia;
    base.has_elp = universal.has_elp;
    base.has_talking_dictionary = universal.has_talking_dictionary;
    base.has_glottolog = universal.has_glottolog;

    // Collect model-planned URLs for deduplication against universal resources
    const discoveryUrls = new Set(discovery.sources.map((s) => s.url));
    base.featherless_sources = discoveryUrls.size;

    // Count universal resources that the model planner didn't already find
    let universalCount = 0;
    const wikiName = encodeURIComponent(lang.name.replace(/ /g, "_"));
    const universalUrls: [boolean, string][] = [
      [
        universal.has_wikipedia,
        `https://en.wikipedia.org/wiki/${wikiName}_language`,
      ],
      [
        universal.has_elp,
        `https://endangeredlanguages.com/lang/${lang.iso_code}`,
      ],
      [
        universal.has_talking_dictionary,
        `https://talkingdictionary.swarthmore.edu/${lang.name.toLowerCase().replace(/ /g, "-")}`,
      ],
      [
        universal.has_glottolog,
        `https://glottolog.org/resource/languoid/id/${lang.glottocode}`,
      ],
    ];

    for (const [exists, url] of universalUrls) {
      if (exists && !discoveryUrls.has(url)) {
        universalCount++;
      }
    }

    base.sources_discovered = discoveryUrls.size + universalCount;

    // Infer has_dictionary
    base.has_dictionary =
      universal.has_talking_dictionary ||
      discovery.sources.some(
        (s) => classifySourceType(s.url, s.description) === "dictionary"
      );

    // Infer has_audio
    base.has_audio = discovery.sources.some(
      (s) =>
        AUDIO_PATTERN.test(s.url) ||
        AUDIO_PATTERN.test(s.title) ||
        AUDIO_PATTERN.test(s.description)
    );
  } catch (err) {
    base.error = getErrorMessage(err);
  }

  return base;
}

// ─── Elastic Update ─────────────────────────────────────────────────────────

async function updateElastic(
  client: Client,
  result: PrescanResult
): Promise<void> {
  await client.update({
    index: LANGUAGES_INDEX,
    id: result.glottocode,
    doc: {
      preservation_status: {
        sources_discovered: result.sources_discovered,
      },
    },
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🔍 LangSafe — Prescan Languages\n");

  // Validate environment
  const requiredVars = ["ELASTIC_URL", "ELASTIC_API_KEY", "FEATHERLESS_API_KEY"];
  for (const key of requiredVars) {
    if (!process.env[key]) {
      console.error(`❌ Missing env var: ${key}. Set it in .env.local`);
      process.exit(1);
    }
  }

  const client = getClient();

  // Phase 1: Verify target languages exist in Elastic
  console.log(
    `📋 Verifying ${TARGET_LANGUAGES.length} target languages in index...`
  );
  const verified: TargetLanguage[] = [];
  for (const lang of TARGET_LANGUAGES) {
    const entry = await verifyLanguageExists(client, lang.glottocode);
    if (entry) {
      verified.push(lang);
      console.log(`  ✅ ${lang.name} (${lang.glottocode})`);
    } else {
      console.log(
        `  ⚠️  ${lang.name} (${lang.glottocode}) — NOT FOUND, skipping`
      );
    }
  }

  if (verified.length === 0) {
    console.error("❌ No target languages found in Elastic index.");
    process.exit(1);
  }

  // Phase 2: Scan each language sequentially with rate limiting
  console.log(`\n🌐 Scanning ${verified.length} languages...\n`);
  const results: PrescanResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < verified.length; i++) {
    const lang = verified[i];
    const progress = `[${i + 1}/${verified.length}]`;
    console.log(`${progress} 🔎 Scanning ${lang.name}...`);

    const result = await scanLanguage(lang);
    results.push(result);

    if (result.error) {
      console.log(`${progress} ❌ ${lang.name}: ${result.error}`);
    } else {
      console.log(
        `${progress} ✅ ${lang.name}: ${result.sources_discovered} sources` +
          ` (dict: ${result.has_dictionary ? "yes" : "no"}` +
          `, audio: ${result.has_audio ? "yes" : "no"}` +
          `, wiki: ${result.has_wikipedia ? "yes" : "no"})`
      );
    }

    // Rate limit model-planned source discovery calls.
    if (i < verified.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Phase 3: Update Elastic
  console.log(`\n📤 Updating Elasticsearch...`);
  let updated = 0;
  for (const result of results) {
    if (result.sources_discovered > 0) {
      try {
        await updateElastic(client, result);
        updated++;
        console.log(
          `  ✅ ${result.name}: sources_discovered = ${result.sources_discovered}`
        );
      } catch (err) {
        console.error(`  ❌ ${result.name}: ${getErrorMessage(err)}`);
      }
    }
  }

  // Phase 4: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📊 Prescan Summary\n`);
  console.log(`  Languages scanned:   ${results.length}`);
  console.log(`  Languages updated:   ${updated}`);
  console.log(
    `  Total sources found: ${results.reduce((s, r) => s + r.sources_discovered, 0)}`
  );
  console.log(
    `  With dictionary:     ${results.filter((r) => r.has_dictionary).length}`
  );
  console.log(
    `  With audio:          ${results.filter((r) => r.has_audio).length}`
  );
  console.log(
    `  With Wikipedia:      ${results.filter((r) => r.has_wikipedia).length}`
  );
  console.log(`  Errors:              ${results.filter((r) => r.error).length}`);
  console.log(`  Elapsed:             ${elapsed}s`);
  console.log(`\n✅ Done.\n`);
}

main().catch((err) => {
  console.error("❌ Prescan failed:", err);
  process.exit(1);
});
