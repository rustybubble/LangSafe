/**
 * Standalone Jejueo Wikipedia article crawler.
 *
 * Extracts vocabulary from https://en.wikipedia.org/wiki/Jeju_language using
 * Jeju-specific cheerio selectors (span[lang="jje"], tables with "Jeju" columns).
 *
 * NOT used by the multi-language pipeline — the dispatch system uses
 * crawlWikipediaGeneric() from wikipedia-generic.ts instead, which works
 * with any language's Wikipedia article.
 *
 * Usage: npx tsx lib/crawlers/wikipedia.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as cheerio from "cheerio";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { VocabularyEntry } from "../types";
import { getStagehandModelConfig } from "../apis/stagehand-model";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JEJU_ARTICLE_URL = "https://en.wikipedia.org/wiki/Jeju_language";

function makeCrossRef(url: string) {
  // Derive a human-readable title from the Wikipedia URL
  const slug = url.split("/wiki/").pop()?.replace(/_/g, " ") || "Wikipedia Article";
  return {
    source_title: `${slug} — Wikipedia`,
    source_url: url,
    source_type: "encyclopedia",
  };
}

const PAGE_EXTRACT_TIMEOUT_MS = 120_000;

// Stagehand extraction schema
const WikiVocabSchema = z.array(
  z.object({
    jeju_word: z
      .string()
      .describe("Jejueo word in Hangul (e.g. '가달', '하르방')"),
    romanized: z
      .string()
      .describe("Romanized form (e.g. 'gadal', 'hareubang')"),
    english_meaning: z
      .string()
      .describe("English definition or meaning (e.g. 'bridle', 'grandfather')"),
    context: z
      .string()
      .describe(
        "Which section of the article this came from (e.g. 'vocabulary', 'kinship', 'grammar/pronouns', 'phonology')"
      ),
  })
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toVocabularyEntry(
  raw: {
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  },
  index: number,
  crossRef?: { source_title: string; source_url: string; source_type: string }
): VocabularyEntry {
  const ctx = raw.context.toLowerCase();
  let pos = "unknown";
  if (ctx.includes("pronoun") || ctx.includes("deixis")) pos = "pronoun";
  else if (ctx.includes("verb")) pos = "verb";
  else if (ctx.includes("noun") || ctx.includes("kinship")) pos = "noun";
  else if (ctx.includes("particle")) pos = "particle";

  // Infer POS from the word form if still unknown
  if (pos === "unknown") {
    const word = raw.romanized.toLowerCase();
    if (word.endsWith("-") || word.endsWith("da")) pos = "verb";
  }

  let cluster: string | undefined;
  if (ctx.includes("kinship")) cluster = "kinship";
  else if (ctx.includes("phonolog") || ctx.includes("consonant") || ctx.includes("vowel") || ctx.includes("prosody"))
    cluster = "phonology";
  else if (
    ctx.includes("grammar") ||
    ctx.includes("noun") ||
    ctx.includes("verb") ||
    ctx.includes("pronoun") ||
    ctx.includes("particle") ||
    ctx.includes("deixis")
  )
    cluster = "grammar";
  else if (
    ctx.includes("vocabulary") ||
    ctx.includes("sound symbolism") ||
    ctx.includes("cultural")
  )
    cluster = "vocabulary";
  else if (ctx.includes("orthography")) cluster = "orthography";

  return {
    id: `wiki-${String(index + 1).padStart(4, "0")}`,
    headword_native: raw.jeju_word.trim(),
    headword_romanized: raw.romanized.trim(),
    pos,
    definitions: [
      {
        language: "en" as const,
        text: raw.english_meaning
          .trim()
          .replace(/^["'""]|["'""]$/g, ""),
      },
    ],
    example_sentences: [],
    related_terms: [],
    cross_references: crossRef ? [crossRef] : [],
    semantic_cluster: cluster,
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)),
        ms
      )
    ),
  ]);
}

function deduplicateEntries(entries: VocabularyEntry[]): VocabularyEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.headword_native;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSessionClosed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("CDP transport closed") ||
    msg.includes("no page available") ||
    msg.includes("Session closed") ||
    msg.includes("Target closed") ||
    msg.includes("Protocol error")
  );
}

// ---------------------------------------------------------------------------
// Cheerio-based extraction (fallback / insurance)
// ---------------------------------------------------------------------------

async function fetchArticleHTML(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "LangSafe/1.0 (language preservation research; contact: LangSafe@example.com)",
    },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  return res.text();
}

/**
 * Find the nearest section heading (h2/h3) for a given element
 */
function getSectionContext(
  $: cheerio.CheerioAPI,
  el: Parameters<cheerio.CheerioAPI>[0]
): string {
  let current = $(el);
  // Walk up and backward to find the nearest heading
  while (current.length) {
    const prev = current.prevAll("div.mw-heading").first();
    if (prev.length) {
      const h = prev.find("h2, h3, h4").first();
      if (h.length) return h.text().replace(/\[edit\]/g, "").trim();
    }
    current = current.parent();
  }
  return "unknown";
}

/**
 * Extract vocabulary from wikitables with English | Jeju | X columns
 */
function extractVocabTables(
  $: cheerio.CheerioAPI
): Array<{
  jeju_word: string;
  romanized: string;
  english_meaning: string;
  context: string;
}> {
  const results: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  $("table.wikitable").each((_, table) => {
    const $table = $(table);
    const headers = $table
      .find("tr")
      .first()
      .find("th")
      .map((__, th) => $(th).text().trim().toLowerCase())
      .get();

    // Only process tables with "english" and "jeju" columns
    const englishIdx = headers.findIndex((h) => h.includes("english"));
    const jejuIdx = headers.findIndex(
      (h) => h.includes("jeju") && !h.includes("original")
    );
    if (englishIdx === -1 || jejuIdx === -1) return;

    // Determine context from the section heading above this table
    const context = getSectionContext($, table);

    $table
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = $(row).find("td");
        if (cells.length < Math.max(englishIdx, jejuIdx) + 1) return;

        const englishCell = cells.eq(englishIdx);
        const jejuCell = cells.eq(jejuIdx);

        const english = englishCell.text().trim();
        const jejuNative = jejuCell.find('span[lang="jje"]').first().text().trim();
        const jejuRomanized =
          jejuCell.find('i[lang="jje-Latn"]').first().text().trim() ||
          jejuCell.find('span[lang="jje-Latn"]').first().text().trim();

        if (jejuNative && english) {
          results.push({
            jeju_word: jejuNative,
            romanized: jejuRomanized || "",
            english_meaning: english,
            context: context.toLowerCase(),
          });
        }
      });
  });

  return results;
}

/**
 * Extract pronouns from the pronoun table
 */
function extractPronounTable(
  $: cheerio.CheerioAPI
): Array<{
  jeju_word: string;
  romanized: string;
  english_meaning: string;
  context: string;
}> {
  const results: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  // Find the pronouns section heading
  const pronounHeading = $('h3#Pronouns_and_deixis');
  if (!pronounHeading.length) return results;

  // The table is the next wikitable after this heading
  const table = pronounHeading
    .closest("div.mw-heading")
    .nextAll("table.wikitable")
    .first();
  if (!table.length) return results;

  table.find("td").each((_, cell) => {
    const $cell = $(cell);
    const jejuSpans = $cell.find('span[lang="jje"]');
    const romanSpans = $cell.find('span[lang="jje-Latn"]');

    if (jejuSpans.length && romanSpans.length) {
      const native = jejuSpans.first().text().trim();
      const romanized = romanSpans.first().text().trim();
      // Extract the quoted English meaning from the cell text
      const cellText = $cell.text();
      const quotedMatch = cellText.match(/"([^"]+)"/);
      const english = quotedMatch ? quotedMatch[1] : "";

      if (native && english) {
        results.push({
          jeju_word: native,
          romanized,
          english_meaning: english,
          context: "grammar/pronouns",
        });
      }
    }
  });

  return results;
}

/**
 * Extract inline Jejueo vocabulary from article body text.
 * Looks for <span lang="jje"> followed by romanization and quoted meanings.
 */
function extractInlineVocab(
  $: cheerio.CheerioAPI
): Array<{
  jeju_word: string;
  romanized: string;
  english_meaning: string;
  context: string;
}> {
  const results: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  // Target specific content sections (not references/notes)
  const contentBody = $(".mw-parser-output");

  contentBody.find('span[lang="jje"]').each((_, span) => {
    const $span = $(span);
    const native = $span.text().trim();
    if (!native || native.length > 30) return; // Skip long text passages

    // Find romanization: next sibling or nearby element with lang="jje-Latn"
    const parent = $span.parent();
    let romanized = "";

    // Check immediate next siblings for romanization
    const nextRoman =
      parent.find('i[lang="jje-Latn"]').first().text().trim() ||
      parent.find('span[lang="jje-Latn"]').first().text().trim();
    // If parent is a span wrapper, look at parent's siblings too
    if (nextRoman) {
      romanized = nextRoman;
    } else {
      const parentParent = parent.parent();
      romanized =
        parentParent.find('i[lang="jje-Latn"]').first().text().trim() ||
        parentParent.find('span[lang="jje-Latn"]').first().text().trim();
    }

    // Try to extract English meaning from quoted text nearby
    const surroundingText = parent.parent().text();
    let english = "";

    // Pattern: "word" or 'word' after the romanized form
    // Common Wikipedia pattern: romanized "english meaning"
    if (romanized) {
      const escapedRoman = romanized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const afterRomanPattern = new RegExp(
        `${escapedRoman}[""']\\s*["""]([^"""]+)["""]`
      );
      const match = surroundingText.match(afterRomanPattern);
      if (match) {
        english = match[1];
      }
    }

    // Also try: "english" pattern directly after the native word
    if (!english) {
      const textAfter = surroundingText.substring(
        surroundingText.indexOf(native) + native.length
      );
      const quoteMatch = textAfter.match(/["""]([^"""]{2,60})["""]/);
      if (quoteMatch) {
        english = quoteMatch[1];
      }
    }

    if (!english || !romanized) return;

    // Skip if the "english" is actually just quoted Jejueo or Korean text
    if (/^[가-힣ㄱ-ㅎㅏ-ㅣᄀ-ᇿ]+$/.test(english)) return;

    // Get section context
    const section = getSectionContext($, span);

    // Skip entries from non-vocabulary sections
    const sectionLower = section.toLowerCase();
    if (
      sectionLower.includes("nomenclature") ||
      sectionLower.includes("geographic") ||
      sectionLower.includes("history") ||
      sectionLower.includes("revitalization") ||
      sectionLower.includes("attitudes") ||
      sectionLower.includes("references") ||
      sectionLower.includes("see also") ||
      sectionLower.includes("notes") ||
      sectionLower.includes("bibliography")
    )
      return;

    results.push({
      jeju_word: native,
      romanized,
      english_meaning: english,
      context: sectionLower,
    });
  });

  return results;
}

/**
 * Extract vocabulary from list items (kinship terms, demonstratives, etc.)
 */
function extractListVocab(
  $: cheerio.CheerioAPI
): Array<{
  jeju_word: string;
  romanized: string;
  english_meaning: string;
  context: string;
}> {
  const results: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  // List items often contain: <span lang="jje">word</span> <i lang="jje-Latn">roman</i> "meaning"
  $("ul > li, ol > li").each((_, li) => {
    const $li = $(li);
    const jejuSpan = $li.find('span[lang="jje"]').first();
    if (!jejuSpan.length) return;

    const native = jejuSpan.text().trim();
    if (!native || native.length > 30) return;

    const romanized =
      $li.find('i[lang="jje-Latn"]').first().text().trim() ||
      $li.find('span[lang="jje-Latn"]').first().text().trim();

    // Get the direct text of the list item (not nested lists)
    const liText = $li.clone().children("ul, ol").remove().end().text();

    // Extract quoted meaning
    const quoteMatch = liText.match(/["""]([^"""]{2,60})["""]/);
    const english = quoteMatch ? quoteMatch[1] : "";

    if (!english || !romanized) return;

    const section = getSectionContext($, li);
    const sectionLower = section.toLowerCase();

    // Skip non-vocabulary sections
    if (
      sectionLower.includes("nomenclature") ||
      sectionLower.includes("geographic") ||
      sectionLower.includes("revitalization") ||
      sectionLower.includes("references") ||
      sectionLower.includes("see also")
    )
      return;

    results.push({
      jeju_word: native,
      romanized,
      english_meaning: english,
      context: sectionLower,
    });
  });

  return results;
}

/**
 * Extract grammar examples from interlinear glosses
 */
function extractInterlinearExamples(
  $: cheerio.CheerioAPI
): Array<{
  jeju_word: string;
  romanized: string;
  english_meaning: string;
  context: string;
}> {
  const results: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  // Interlinear glosses have a specific structure with three <p> per morpheme:
  // <p lang="jje">word</p> <p lang="jje-Latn" style="font-style: italic;">roman</p> <p>"meaning"</p>
  $("div.interlinear").each((_, div) => {
    const $div = $(div);
    const morphemes = $div.children("div");

    morphemes.each((__, morphDiv) => {
      const $m = $(morphDiv);
      const ps = $m.find("p");
      if (ps.length < 3) return;

      const native = ps.eq(0).text().trim();
      const romanized = ps.eq(1).text().trim();
      const english = ps.eq(2).text().trim().replace(/^"|"$/g, "");

      // Skip operators like "+", "→", and empty/whitespace
      if (
        !native ||
        !romanized ||
        !english ||
        native === "+" ||
        native === "→" ||
        romanized === "\u00a0" ||
        english === "\u00a0"
      )
        return;

      const section = getSectionContext($, div);

      results.push({
        jeju_word: native,
        romanized,
        english_meaning: english,
        context: `grammar/${section.toLowerCase()}`,
      });
    });
  });

  return results;
}

export async function crawlWikipediaWithCheerio(
  url: string = JEJU_ARTICLE_URL
): Promise<VocabularyEntry[]> {
  console.log("[wikipedia] Starting cheerio-based extraction...");

  const crossRef = makeCrossRef(url);
  const html = await fetchArticleHTML(url);
  const $ = cheerio.load(html);
  console.log("[wikipedia] HTML fetched and loaded into cheerio.");

  // Extract from multiple sources
  const tablEntries = extractVocabTables($);
  console.log(`[wikipedia] Table entries: ${tablEntries.length}`);

  const pronounEntries = extractPronounTable($);
  console.log(`[wikipedia] Pronoun entries: ${pronounEntries.length}`);

  const listEntries = extractListVocab($);
  console.log(`[wikipedia] List entries: ${listEntries.length}`);

  const interlinearEntries = extractInterlinearExamples($);
  console.log(`[wikipedia] Interlinear entries: ${interlinearEntries.length}`);

  const inlineEntries = extractInlineVocab($);
  console.log(`[wikipedia] Inline entries: ${inlineEntries.length}`);

  // Combine all sources
  const allRaw = [
    ...tablEntries,
    ...pronounEntries,
    ...listEntries,
    ...interlinearEntries,
    ...inlineEntries,
  ];

  const allEntries = allRaw.map((raw, i) => toVocabularyEntry(raw, i, crossRef));
  const deduplicated = deduplicateEntries(allEntries);

  console.log(
    `[wikipedia] Cheerio: ${allRaw.length} raw → ${deduplicated.length} unique entries`
  );

  return deduplicated;
}

// ---------------------------------------------------------------------------
// Stagehand-based extraction (primary)
// ---------------------------------------------------------------------------

async function crawlWikipediaWithStagehand(
  url: string = JEJU_ARTICLE_URL
): Promise<VocabularyEntry[]> {
  console.log("[wikipedia] Starting Stagehand extraction...");

  const suppressedErrors: string[] = [];
  const rejectionHandler = (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (
      msg.includes("CDP") ||
      msg.includes("socket-close") ||
      msg.includes("transport")
    ) {
      suppressedErrors.push(msg);
    }
  };
  process.on("unhandledRejection", rejectionHandler);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: getStagehandModelConfig(),
    verbose: 0,
    browserbaseSessionCreateParams: {
      timeout: 600,
      keepAlive: true,
    },
  });

  const allRaw: Array<{
    jeju_word: string;
    romanized: string;
    english_meaning: string;
    context: string;
  }> = [];

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    console.log(`[wikipedia] Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Extract vocabulary section
    const sections = [
      {
        prompt: `Extract ALL Jejueo vocabulary words from the "Vocabulary" section of this Wikipedia article about the Jeju language.
Look for tables with English | Jeju | Middle Mongol columns and English | Jeju | Japanese columns.
Also extract any vocabulary words mentioned in the running text with their Hangul form, romanization, and English meaning.
For each entry, set context to "vocabulary".`,
        label: "Vocabulary",
      },
      {
        prompt: `Extract ALL Jejueo kinship terms from the "Kinship terminology" section.
Look for words like 하르방 (hareubang) "grandfather", 성 (seong) "older same-gender sibling", etc.
Include compound kinship terms with prefixes like 큰-, 셋-, 족은-.
For each entry, set context to "kinship".`,
        label: "Kinship",
      },
      {
        prompt: `Extract ALL Jejueo pronouns and grammar words from the "Pronouns and deixis" section and the "Nouns" section.
Look for pronouns like 나/내 "I/me", demonstratives like 이 "this", and noun examples like 쉐 "cattle".
Also extract noun particles and grammar markers from the particles table.
For each entry, set context to "grammar/pronouns" or "grammar/nouns".`,
        label: "Grammar",
      },
      {
        prompt: `Extract ALL Jejueo words from the "Sound symbolism" section.
Look for ideophones and their variants showing consonant and vowel sound symbolism.
For example: 고시롱 (gosirong) "savory", 동골동골 "round [of a small object]".
For each entry, set context to "vocabulary/sound-symbolism".`,
        label: "Sound symbolism",
      },
    ];

    for (const section of sections) {
      console.log(`[wikipedia] Extracting: ${section.label}...`);
      try {
        const extracted = await withTimeout(
          stagehand.extract(section.prompt, WikiVocabSchema),
          PAGE_EXTRACT_TIMEOUT_MS,
          `${section.label} extraction`
        );
        if (extracted && extracted.length > 0) {
          console.log(
            `   Found ${extracted.length} entries in ${section.label}`
          );
          allRaw.push(...extracted);
        } else {
          console.log(`   No entries found in ${section.label}`);
        }
      } catch (err) {
        if (isSessionClosed(err)) {
          console.warn(
            `[wikipedia] Session closed during ${section.label} extraction.`
          );
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `   Error extracting ${section.label}: ${msg.slice(0, 100)}`
        );
      }

      // Scroll to next section
      try {
        await stagehand.act(
          `Scroll down to the next major section of this Wikipedia article about the Jeju language.`
        );
        await page.waitForTimeout(1000);
      } catch (scrollErr) {
        if (isSessionClosed(scrollErr)) {
          console.warn("[wikipedia] Session closed during scroll.");
          break;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[wikipedia] Stagehand error: ${msg}`);
  } finally {
    try {
      await stagehand.close();
    } catch {
      // Ignore
    }
    process.removeListener("unhandledRejection", rejectionHandler);
    if (suppressedErrors.length > 0) {
      console.log(
        `[wikipedia] Suppressed ${suppressedErrors.length} CDP error(s).`
      );
    }
  }

  const crossRef = makeCrossRef(url);
  const allEntries = allRaw.map((raw, i) => toVocabularyEntry(raw, i, crossRef));
  const deduplicated = deduplicateEntries(allEntries);

  console.log(
    `[wikipedia] Stagehand: ${allRaw.length} raw → ${deduplicated.length} unique entries`
  );

  return deduplicated;
}

// ---------------------------------------------------------------------------
// Main crawler (Stagehand → cheerio fallback)
// ---------------------------------------------------------------------------

export async function crawlWikipedia(
  url: string = JEJU_ARTICLE_URL
): Promise<VocabularyEntry[]> {
  // Try Stagehand first
  try {
    const entries = await crawlWikipediaWithStagehand(url);
    if (entries.length >= 10) {
      return entries;
    }
    console.log(
      "[wikipedia] Stagehand returned few entries, falling back to cheerio..."
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[wikipedia] Stagehand failed: ${msg}, falling back to cheerio...`);
  }

  // Fallback to cheerio
  return crawlWikipediaWithCheerio(url);
}

// ---------------------------------------------------------------------------
// Test function
// ---------------------------------------------------------------------------

export async function testCrawl(): Promise<void> {
  console.log("=== Wikipedia Language Crawler Test ===\n");

  try {
    const entries = await crawlWikipediaWithCheerio();

    if (entries.length === 0) {
      console.error("No entries extracted.");
      process.exit(1);
    }

    console.log(`\nTotal entries extracted: ${entries.length}\n`);
    console.log("First 15 entries:");
    console.log("-".repeat(70));

    for (const entry of entries.slice(0, 15)) {
      const def = entry.definitions[0]?.text ?? "—";
      console.log(
        `  ${entry.headword_native} (${entry.headword_romanized}) [${entry.pos}] → ${def}  {${entry.semantic_cluster ?? ""}}`
      );
    }

    console.log("-".repeat(70));
    console.log(`\nSample full entry (JSON):`);
    console.log(JSON.stringify(entries[0], null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Crawl failed: ${msg}`);
    process.exit(1);
  }
}

// Run test if executed directly
const isDirectRun = process.argv[1]?.includes("wikipedia");
if (isDirectRun) {
  testCrawl();
}
