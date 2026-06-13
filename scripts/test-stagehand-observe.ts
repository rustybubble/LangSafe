/**
 * Test Stagehand observe() classification directly — bypasses Cheerio/BrightData race.
 *
 * Usage: npx tsx scripts/test-stagehand-observe.ts [url]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Stagehand } from "@browserbasehq/stagehand";
import { getStagehandModelConfig } from "../lib/apis/stagehand-model.js";

async function main() {
  const url = process.argv[2] || "https://www.endangeredlanguages.com/lang/4065";

  console.log("=== Stagehand observe() Classification Test ===\n");
  console.log(`URL: ${url}\n`);

  if (!process.env.BROWSERBASE_API_KEY) {
    console.log("SKIP — BROWSERBASE_API_KEY not set");
    return;
  }

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: getStagehandModelConfig(),
    verbose: 0,
    browserbaseSessionCreateParams: { timeout: 120 },
  });

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    console.log("Navigating...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 15_000 });
    await page.waitForTimeout(2_000);

    // Step 1: observe()
    console.log("\nRunning observe()...");
    const observations = await stagehand.observe(
      "Analyze this page's structure. Look for: " +
      "1) Pagination controls (next/prev buttons, page numbers) " +
      "2) Search bars or filter inputs " +
      "3) Infinite scroll or 'load more' buttons " +
      "4) Static content that fits on one screen"
    );

    console.log(`\nObservations (${observations.length}):`);
    for (const obs of observations) {
      console.log(`  - ${obs.description}`);
    }

    // Step 2: classify
    const text = observations.map((o: { description: string }) => o.description).join(" ").toLowerCase();
    let strategy = "SIMPLE";
    if (/pagination|page\s*\d|next\s*page|previous|»|›/.test(text)) strategy = "PAGINATED";
    else if (/search|filter|query|find/.test(text)) strategy = "SEARCHABLE";
    else if (/scroll|load\s*more|infinite|show\s*more/.test(text)) strategy = "SCROLLABLE";

    console.log(`\n✓ Classification: ${strategy}`);

    // Step 3: extract
    console.log("\nRunning extract()...");
    const { z } = await import("zod");
    const result = await stagehand.extract(
      "Extract all text content from this page. Include headings, paragraphs, table data, list items, and any vocabulary or dictionary entries.",
      z.object({
        title: z.string(),
        content: z.string(),
        language: z.string(),
      })
    );

    console.log(`\n✓ Extracted:`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Language: ${result.language}`);
    console.log(`  Content: ${result.content.length} chars`);
    console.log(`  Preview: ${result.content.slice(0, 300).replace(/\n/g, " ")}...`);
  } finally {
    try { await stagehand.close(); } catch { /* ignore */ }
  }
}

main().catch(console.error);
