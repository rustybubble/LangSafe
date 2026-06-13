/**
 * Stagehand Demo — showcases the full observe -> classify -> content-observe -> act -> extract flow.
 *
 * This script is designed for live demos to show Stagehand/Browserbase capabilities:
 *   - observe() for page structure analysis
 *   - observe() for content understanding (adaptive extraction)
 *   - act() for navigation (pagination, search)
 *   - extract() with AI-enhanced prompts
 *   - Browserbase session replay URL
 *
 * Usage:
 *   npx tsx scripts/demo-stagehand.ts [url] [type]
 *
 * Examples:
 *   npx tsx scripts/demo-stagehand.ts                                          # Glosbe Jeju dictionary
 *   npx tsx scripts/demo-stagehand.ts https://forvo.com/languages/jje/         # Forvo pronunciations
 *   npx tsx scripts/demo-stagehand.ts https://en.glosbe.com/jje/en dictionary  # explicit type
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { getErrorMessage } from "../lib/utils/errors.js";
import { getStagehandModelConfig } from "../lib/apis/stagehand-model.js";

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_URL = "https://en.glosbe.com/jje/en";
const DEFAULT_TYPE = "dictionary";

const PageContentSchema = z.object({
  title: z.string().describe("The page title or main heading"),
  content: z.string().describe("All text content from the page, including headings, paragraphs, tables, and list items"),
  language: z.string().describe("Primary language code of the content: en, ko, ja, etc."),
  audio_urls: z.array(z.string()).optional().describe("URLs of audio files found on the page"),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function hr(label: string) {
  const pad = Math.max(0, 60 - label.length - 4);
  console.log(`\n${"─".repeat(2)} ${label} ${"─".repeat(pad)}`);
}

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.argv[2] || DEFAULT_URL;
  const extractionType = process.argv[3] || DEFAULT_TYPE;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Stagehand/Browserbase Demo — Observe -> Act -> Extract     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  URL:  ${url}`);
  console.log(`  Type: ${extractionType}`);

  if (!process.env.BROWSERBASE_API_KEY) {
    console.log("\n  SKIP — BROWSERBASE_API_KEY not set in .env.local");
    return;
  }

  // ── Step 1: Initialize ──
  hr("Step 1: Initialize Browserbase Session");
  const initStart = Date.now();

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: getStagehandModelConfig(),
    verbose: 0,
    browserbaseSessionCreateParams: { timeout: 120 },
  });

  const rejectionHandler = (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("CDP") || msg.includes("socket-close") || msg.includes("transport")) {
      // suppress
    }
  };
  process.on("unhandledRejection", rejectionHandler);

  try {
    await stagehand.init();
    const sessionUrl = stagehand.browserbaseSessionURL;
    console.log(`  Session initialized in ${elapsed(initStart)}`);
    if (sessionUrl) {
      console.log(`  Replay URL: ${sessionUrl}`);
    }

    // ── Step 2: Navigate ──
    hr("Step 2: Navigate to Target");
    const navStart = Date.now();
    const page = stagehand.context.pages()[0];
    await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 15_000 });
    await page.waitForTimeout(2_000);
    console.log(`  Page loaded in ${elapsed(navStart)}`);

    // ── Step 3: Structure observe() ──
    hr("Step 3: observe() — Page Structure Analysis");
    const structStart = Date.now();
    const structureObs = await stagehand.observe(
      "Analyze this page's structure. Look for: " +
      "1) Pagination controls (next/prev buttons, page numbers) " +
      "2) Search bars or filter inputs " +
      "3) Infinite scroll or 'load more' buttons " +
      "4) Static content that fits on one screen"
    );

    const structFindings = structureObs
      .map((o: { description: string }) => o.description)
      .filter(Boolean)
      .slice(0, 5);
    const structText = structFindings.join(" ").toLowerCase();

    let strategy = "SIMPLE";
    if (/pagination|page\s*\d|next\s*page|previous|>>|>/.test(structText)) strategy = "PAGINATED";
    else if (/search|filter|query|find/.test(structText)) strategy = "SEARCHABLE";
    else if (/scroll|load\s*more|infinite|show\s*more/.test(structText)) strategy = "SCROLLABLE";

    console.log(`  Completed in ${elapsed(structStart)}`);
    console.log(`  Findings (${structFindings.length}):`);
    for (const f of structFindings) {
      console.log(`    -> ${f}`);
    }
    console.log(`  Classification: ${strategy}`);

    // ── Step 4: Content observe() ──
    hr("Step 4: observe() — Content Understanding");
    const contentStart = Date.now();
    const contentPrompt = extractionType === "dictionary"
      ? "Analyze the content on this page. Describe what you see: " +
        "vocabulary tables, word lists, dictionary entries, definition sections, " +
        "audio/pronunciation buttons, example sentences, part-of-speech labels, " +
        "translation pairs, and any navigation to more entries."
      : "Analyze the content on this page. Describe what you see: " +
        "article sections, data tables, vocabulary lists, embedded media, " +
        "downloadable files, linguistic examples, and structured data.";

    const contentObs = await stagehand.observe(contentPrompt);
    const contentFindings = contentObs
      .map((o: { description: string }) => o.description)
      .filter(Boolean)
      .slice(0, 8);

    console.log(`  Completed in ${elapsed(contentStart)}`);
    console.log(`  Content findings (${contentFindings.length}):`);
    for (const f of contentFindings) {
      console.log(`    -> ${f}`);
    }

    // ── Step 5: Build enhanced prompt ──
    hr("Step 5: Build AI-Enhanced Extraction Prompt");
    const basePrompt = "Extract all text content from this page. Include headings, paragraphs, table data, list items, and any vocabulary or dictionary entries. Preserve structure as plain text. Also find any audio file URLs on the page.";
    let enhancedPrompt = basePrompt;
    if (contentFindings.length > 0) {
      const context = contentFindings.join("; ");
      enhancedPrompt = `Page structure analysis found: ${context}. Use this understanding to extract more thoroughly. ${basePrompt}`;
    }
    console.log(`  Base prompt: ${basePrompt.length} chars`);
    console.log(`  Enhanced prompt: ${enhancedPrompt.length} chars (+${enhancedPrompt.length - basePrompt.length} from observations)`);
    if (contentFindings.length > 0) {
      console.log(`  Prepended context: "${contentFindings.slice(0, 3).join("; ")}${contentFindings.length > 3 ? "; ..." : ""}"`);
    }

    // ── Step 6: Extract ──
    hr("Step 6: extract() — AI-Powered Content Extraction");
    const extractStart = Date.now();
    const result = await stagehand.extract(enhancedPrompt, PageContentSchema);

    console.log(`  Completed in ${elapsed(extractStart)}`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Language: ${result.language}`);
    console.log(`  Content: ${result.content.length} chars`);
    if (result.audio_urls && result.audio_urls.length > 0) {
      console.log(`  Audio URLs: ${result.audio_urls.length}`);
      for (const u of result.audio_urls.slice(0, 3)) {
        console.log(`    -> ${u}`);
      }
    }
    console.log(`  Preview: ${result.content.slice(0, 300).replace(/\n/g, " ")}...`);

    // ── Step 7: Multi-page (if PAGINATED) ──
    let totalPages = 1;
    let totalContent = result.content.length;

    if (strategy === "PAGINATED") {
      hr("Step 7: act() + extract() — Multi-Page Navigation");
      const maxDemoPages = 2; // Keep demo short

      for (let i = 0; i < maxDemoPages; i++) {
        const actStart = Date.now();
        console.log(`\n  Page ${i + 2}:`);
        try {
          await stagehand.act("Click the next page button or navigate to the next page of results");
          await page.waitForTimeout(2000);
          console.log(`    act() completed in ${elapsed(actStart)}`);

          const pageExtractStart = Date.now();
          const pageResult = await stagehand.extract(enhancedPrompt, PageContentSchema);
          totalPages++;
          totalContent += pageResult.content.length;
          console.log(`    extract() completed in ${elapsed(pageExtractStart)}`);
          console.log(`    Content: ${pageResult.content.length} chars`);
          console.log(`    Preview: ${pageResult.content.slice(0, 200).replace(/\n/g, " ")}...`);
        } catch (err) {
          console.log(`    Navigation ended: ${getErrorMessage(err)}`);
          break;
        }
      }
    } else {
      console.log("\n  (Skipping multi-page — page classified as " + strategy + ")");
    }

    // ── Summary ──
    hr("Summary");
    console.log(`  URL:              ${url}`);
    console.log(`  Classification:   ${strategy}`);
    console.log(`  Structure obs:    ${structFindings.length} findings`);
    console.log(`  Content obs:      ${contentFindings.length} findings`);
    console.log(`  Pages extracted:  ${totalPages}`);
    console.log(`  Total content:    ${totalContent.toLocaleString()} chars`);
    console.log(`  Total time:       ${elapsed(initStart)}`);
    if (sessionUrl) {
      console.log(`  Session replay:   ${sessionUrl}`);
    }
    console.log();

  } finally {
    try { await stagehand.close(); } catch { /* ignore */ }
    process.removeListener("unhandledRejection", rejectionHandler);
  }
}

main().catch(console.error);
