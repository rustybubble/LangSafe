/**
 * Standalone UH Manoa Jejueo-English dictionary crawler (Stagehand-based).
 *
 * Extracts entries from the specific Jejueo-English Basic Dictionary PDF hosted
 * at University of Hawaii. NOT used by the multi-language pipeline — the dispatch
 * system uses crawlUHDictionaryLite() in dispatch.ts for generic hawaii.edu pages.
 *
 * Usage: npx tsx lib/crawlers/uh-dictionary.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { VocabularyEntry } from "../types";
import { getStagehandModelConfig } from "../apis/stagehand-model";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JEJU_DICTIONARY_SOURCE_URL =
  "https://sites.google.com/a/hawaii.edu/jejueo/jejueo-english-basic-dictionary-%EC%A0%9C%EC%A3%BC%EC%96%B4-%EC%98%81%EC%96%B4-%EA%B8%B0%EC%B4%88-%EC%82%AC%EC%A0%84";

const JEJU_DICTIONARY_PDF_URL =
  "https://drive.google.com/file/d/1sa6OAiV2VHvxYpmcXOvzha-PYHwzfdB-/view";

function makeCrossRef(sourceUrl: string, title?: string) {
  return {
    source_title: title || sourceUrl,
    source_url: sourceUrl,
    source_type: "dictionary",
  };
}

const PAGE_EXTRACT_TIMEOUT_MS = 180_000; // 3 min per page — dense pages with 300+ entries need time
const MAX_PAGES = 50;

// Schema for a single page worth of extracted entries
const DictEntrySchema = z.array(
  z.object({
    romanized: z.string().describe("Romanized Jejueo headword (e.g. 'eleubda')"),
    hangul: z.string().describe("Hangul form of the Jejueo word (e.g. '에릅다')"),
    definition: z.string().describe("English definition/meaning"),
    pos: z
      .string()
      .optional()
      .describe("Part of speech if indicated (noun, verb, adj, etc.)"),
  })
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toVocabularyEntry(
  raw: z.infer<typeof DictEntrySchema>[number],
  index: number,
  crossRef?: { source_title: string; source_url: string; source_type: string }
): VocabularyEntry {
  return {
    id: `uh-${String(index + 1).padStart(4, "0")}`,
    headword_native: raw.hangul.trim(),
    headword_romanized: raw.romanized.trim(),
    pos: raw.pos?.toLowerCase() ?? "unknown",
    definitions: [{ language: "en" as const, text: raw.definition.trim() }],
    example_sentences: [],
    related_terms: [],
    cross_references: crossRef ? [crossRef] : [],
    semantic_cluster: undefined,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

function deduplicateEntries(entries: VocabularyEntry[]): VocabularyEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.headword_native;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Returns true if the error indicates the browser session has been closed */
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
// Main crawler
// ---------------------------------------------------------------------------

export async function crawlUHDictionary(options?: {
  pdfUrl?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}): Promise<VocabularyEntry[]> {
  const pdfUrl = options?.pdfUrl ?? JEJU_DICTIONARY_PDF_URL;
  const sourceUrl = options?.sourceUrl ?? JEJU_DICTIONARY_SOURCE_URL;
  const crossRef = makeCrossRef(sourceUrl, options?.sourceTitle);

  console.log("[uh-dictionary] Starting Stagehand crawler...");

  // Prevent Stagehand's internal CDP errors from crashing the process
  const suppressedErrors: string[] = [];
  const rejectionHandler = (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("CDP") || msg.includes("socket-close") || msg.includes("transport")) {
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
      timeout: 600, // 10 minutes in seconds — Developer plan supports extended sessions
      keepAlive: true,
    },
  });

  const allEntries: VocabularyEntry[] = [];

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    console.log(`[uh-dictionary] Navigating to PDF: ${pdfUrl}...`);
    await page.goto(pdfUrl, { waitUntil: "networkidle" });
    // Give the PDF renderer time to load
    await page.waitForTimeout(3000);

    let pageNum = 0;
    let consecutiveEmpty = 0;
    let sessionAlive = true;

    while (pageNum < MAX_PAGES && consecutiveEmpty < 3 && sessionAlive) {
      pageNum++;
      console.log(`[uh-dictionary] Extracting from PDF page view ${pageNum}...`);

      try {
        const extracted = await withTimeout(
          stagehand.extract(
            `Extract ALL dictionary entries visible on the current page of this Jejueo-English dictionary PDF.
Each entry has the format: romanized_word hangul_word english_definition.
For example: "eleubda 에릅다 difficult" means romanized="eleubda", hangul="에릅다", definition="difficult".
Extract every single entry you can see. If a part of speech is indicated (n., v., adj., adv., etc.), include it.
Ignore page headers, footers, and page numbers.`,
            DictEntrySchema
          ),
          PAGE_EXTRACT_TIMEOUT_MS,
          `page ${pageNum} extraction`
        );

        if (extracted && extracted.length > 0) {
          console.log(`   Found ${extracted.length} entries on page view ${pageNum}`);
          const mapped = extracted.map((e, i) =>
            toVocabularyEntry(e, allEntries.length + i, crossRef)
          );
          allEntries.push(...mapped);
          consecutiveEmpty = 0;
        } else {
          console.log(`   No entries found on page view ${pageNum}`);
          consecutiveEmpty++;
        }
      } catch (err) {
        if (isSessionClosed(err)) {
          console.warn(`[uh-dictionary] Session closed during page ${pageNum} extraction.`);
          sessionAlive = false;
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`   Extraction error on page ${pageNum}: ${msg}`);
        // Timeouts are NOT counted as empty — Stagehand may still be working.
        if (!msg.includes("Timeout")) {
          consecutiveEmpty++;
        }
      }

      // Scroll down / navigate to next page section of the PDF
      if (pageNum < MAX_PAGES && consecutiveEmpty < 3 && sessionAlive) {
        try {
          await stagehand.act(
            "Scroll down in the PDF viewer to show the next page of dictionary entries. If there is a next page button, click it."
          );
          await page.waitForTimeout(1500);
        } catch (scrollErr) {
          if (isSessionClosed(scrollErr)) {
            console.warn("[uh-dictionary] Session closed during scroll.");
            sessionAlive = false;
            break;
          }
          try {
            // Fallback: keyboard-based page advance
            await page.keyPress("PageDown");
            await page.waitForTimeout(1500);
          } catch (keyErr) {
            if (isSessionClosed(keyErr)) {
              console.warn("[uh-dictionary] Session closed, stopping extraction.");
              sessionAlive = false;
              break;
            }
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[uh-dictionary] Crawler error: ${msg}`);
  } finally {
    try {
      await stagehand.close();
    } catch {
      // Ignore close errors — session may already be closed
    }
    // Clean up the rejection handler
    process.removeListener("unhandledRejection", rejectionHandler);
    if (suppressedErrors.length > 0) {
      console.log(`[uh-dictionary] Suppressed ${suppressedErrors.length} CDP disconnect error(s).`);
    }
  }

  const deduplicated = deduplicateEntries(allEntries);
  console.log(
    `[uh-dictionary] Done. Extracted ${allEntries.length} raw → ${deduplicated.length} unique entries`
  );

  return deduplicated;
}

// ---------------------------------------------------------------------------
// Test function
// ---------------------------------------------------------------------------

export async function testCrawl(): Promise<void> {
  console.log("=== UH Dictionary Crawler Test ===\n");

  try {
    const entries = await crawlUHDictionary();

    if (entries.length === 0) {
      console.error("No entries extracted.");
      process.exit(1);
    }

    console.log(`\nTotal entries extracted: ${entries.length}\n`);
    console.log("First 10 entries:");
    console.log("-".repeat(60));

    for (const entry of entries.slice(0, 10)) {
      const def = entry.definitions[0]?.text ?? "—";
      console.log(
        `  ${entry.headword_native} (${entry.headword_romanized}) [${entry.pos}] → ${def}`
      );
    }

    console.log("-".repeat(60));
    console.log(`\nSample full entry (JSON):`);
    console.log(JSON.stringify(entries[0], null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Crawl failed: ${msg}`);
    process.exit(1);
  }
}

// Run test if executed directly
const isDirectRun = process.argv[1]?.includes("uh-dictionary");
if (isDirectRun) {
  testCrawl();
}
