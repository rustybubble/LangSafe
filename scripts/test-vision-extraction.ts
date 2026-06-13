/**
 * Test script for Vision API extraction from scanned PDFs.
 *
 * Two modes:
 *   1. --synthetic : Creates a minimal scanned PDF in-memory and tests the vision path
 *   2. [pdf-url]   : Downloads a real PDF and runs through the full pipeline
 *
 * Usage:
 *   npx tsx scripts/test-vision-extraction.ts --synthetic
 *   npx tsx scripts/test-vision-extraction.ts https://example.com/scanned.pdf
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { dispatchCrawl, isCrawlError, type VisualContent } from "../lib/crawlers/dispatch";
import {
  runExtractionAgent,
  type ExtractionEntry,
} from "../lib/agents/extraction-agent";
import { getErrorMessage } from "../lib/utils/errors.js";

// ---------------------------------------------------------------------------
// Test 1: Synthetic — bypass crawler, test vision extraction directly
// ---------------------------------------------------------------------------

async function testSyntheticVision() {
  console.log("\n=== Synthetic Vision Test ===\n");
  console.log("Creating a fake scanned PDF scenario to test the vision extraction path.\n");
  console.log("This downloads a real scanned page image and sends it to Claude Vision.\n");

  // Generate a simple SVG dictionary page and convert to PNG via sharp (if available)
  // or fall back to fetching a real scanned image
  const svgDictionaryPage = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <rect width="600" height="800" fill="#f5f0e0"/>
    <text x="300" y="40" text-anchor="middle" font-family="serif" font-size="18" font-weight="bold">A DICTIONARY OF THE JEJUEO LANGUAGE</text>
    <text x="300" y="65" text-anchor="middle" font-family="serif" font-size="12" font-style="italic">Page 47 — H entries</text>
    <line x1="50" y1="80" x2="550" y2="80" stroke="#333" stroke-width="0.5"/>
    <text x="60" y="110" font-family="serif" font-size="14" font-weight="bold">하르방</text>
    <text x="60" y="130" font-family="serif" font-size="12"> (hareubang) n. grandfather; elder. From Korean</text>
    <text x="60" y="148" font-family="serif" font-size="12"> 할아버지 (harabeoji). Used as respectful address</text>
    <text x="60" y="166" font-family="serif" font-size="12"> for elderly men. 「우리 하르방 바당에 갔수다」</text>
    <text x="60" y="184" font-family="serif" font-size="12"> "Our grandfather went to the sea."</text>
    <text x="60" y="220" font-family="serif" font-size="14" font-weight="bold">할망</text>
    <text x="60" y="240" font-family="serif" font-size="12"> (halmang) n. grandmother; elderly woman.</text>
    <text x="60" y="258" font-family="serif" font-size="12"> cf. Korean 할머니 (halmeoni). Also used as</text>
    <text x="60" y="276" font-family="serif" font-size="12"> a spirit name in Jeju shamanism (할망신).</text>
    <text x="60" y="312" font-family="serif" font-size="14" font-weight="bold">혼저</text>
    <text x="60" y="332" font-family="serif" font-size="12"> (honjeo) adv. welcome; please come in.</text>
    <text x="60" y="350" font-family="serif" font-size="12"> Greeting equivalent to Standard Korean 어서오세요.</text>
    <text x="60" y="368" font-family="serif" font-size="12"> 「혼저 옵서예」 "Welcome, please come."</text>
    <text x="60" y="404" font-family="serif" font-size="14" font-weight="bold">바당</text>
    <text x="60" y="424" font-family="serif" font-size="12"> (badang) n. sea, ocean. Cognate with Korean</text>
    <text x="60" y="442" font-family="serif" font-size="12"> 바다 (bada). Central to Jeju maritime culture.</text>
    <text x="60" y="460" font-family="serif" font-size="12"> Semantic domain: maritime, nature.</text>
    <text x="60" y="496" font-family="serif" font-size="14" font-weight="bold">해녀</text>
    <text x="60" y="516" font-family="serif" font-size="12"> (haenyeo) n. woman diver; female sea harvester.</text>
    <text x="60" y="534" font-family="serif" font-size="12"> Traditional profession unique to Jeju Island.</text>
    <text x="60" y="552" font-family="serif" font-size="12"> UNESCO Intangible Cultural Heritage (2016).</text>
    <text x="60" y="570" font-family="serif" font-size="12"> 「해녀 들은 바당에서 전복을 잡아수다」</text>
    <text x="60" y="588" font-family="serif" font-size="12"> "The haenyeo caught abalone in the sea."</text>
    <text x="60" y="624" font-family="serif" font-size="14" font-weight="bold">돌하르방</text>
    <text x="60" y="644" font-family="serif" font-size="12"> (dolhareubang) n. stone grandfather statue;</text>
    <text x="60" y="662" font-family="serif" font-size="12"> iconic basalt guardians placed at village gates.</text>
    <text x="60" y="680" font-family="serif" font-size="12"> Compound: 돌 (stone) + 하르방 (grandfather).</text>
    <line x1="50" y1="710" x2="550" y2="710" stroke="#333" stroke-width="0.5"/>
    <text x="300" y="740" text-anchor="middle" font-family="serif" font-size="10" font-style="italic">— 47 —</text>
  </svg>`;

  // Convert SVG to PNG via sharp if available, otherwise use SVG as base64 directly
  let imageBase64: string;
  let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" = "image/png";

  try {
    const sharp = await import("sharp");
    const pngBuffer = await sharp.default(Buffer.from(svgDictionaryPage)).png().toBuffer();
    imageBase64 = pngBuffer.toString("base64");
    console.log(`✓ Generated ${Math.round(pngBuffer.length / 1024)}KB PNG from SVG dictionary page\n`);
  } catch {
    // sharp not available — encode SVG as PNG-like data
    // Actually, Claude Vision doesn't support SVG. Let's try sending a JPEG/PNG placeholder.
    console.log("sharp not available — encoding SVG directly for test...");
    // We can't send raw SVG to Claude Vision. Let's use a minimal valid PNG.
    // Instead, let's try fetch from a reliable source as last resort
    try {
      const res = await fetch("https://picsum.photos/600/800", {
        headers: { "User-Agent": "LangSafe/1.0" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      imageBase64 = buf.toString("base64");
      mediaType = "image/jpeg";
      console.log(`✓ Downloaded ${Math.round(buf.length / 1024)}KB placeholder image\n`);
      console.log("Note: Using placeholder image — no linguistic content expected.\n");
    } catch (err) {
      console.error(`✗ Cannot create test image: ${getErrorMessage(err)}`);
      return false;
    }
  }

  const visualContent: VisualContent = {
    images: [
      {
        data: imageBase64,
        media_type: mediaType,
        source_label: "Jejueo Dictionary Page 47 (simulated scan)",
      },
    ],
    is_scan: true,
  };

  console.log("Sending scanned dictionary page to Claude Vision...\n");

  const allEntries: ExtractionEntry[] = [];
  const start = Date.now();

  try {
    const result = await runExtractionAgent(
      "[Scanned dictionary page — image content below]",
      "https://example.com/jejueo-dictionary/page47.pdf",
      "A Dictionary of the Jejueo Language — Page 47",
      "dictionary",
      "jje",
      "Jejueo",
      (msg, count) => {
        console.log(`  [progress] ${msg} (${count} entries)`);
      },
      async (entries) => {
        allEntries.push(...entries);
        console.log(`  [save] ${entries.length} entries (total: ${allEntries.length})`);
        return { saved: entries.length };
      },
      async (patterns) => {
        console.log(`  [grammar] ${patterns.length} patterns`);
        return { saved: patterns.length };
      },
      {
        language_family: "Koreanic",
        native_name: "제주어",
        macroarea: "Eurasia",
        contact_languages: ["Korean"],
      },
      visualContent
    );

    const elapsed = Date.now() - start;
    console.log(`\n✓ Vision extraction completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Entries extracted: ${result.entries.length}`);
    console.log(`  Grammar patterns: ${result.grammar_patterns.length}`);
    console.log(`  Total saved: ${result.total_saved}`);

    if (result.entries.length > 0) {
      console.log(`\n  Sample entries from scanned page:`);
      for (const entry of result.entries.slice(0, 8)) {
        const defs = entry.definitions.map((d) => d.text).join("; ");
        console.log(
          `    ${entry.headword_native}${entry.headword_romanized ? ` (${entry.headword_romanized})` : ""} [${entry.pos}] — ${defs}`
        );
        if (entry.ipa) console.log(`      IPA: ${entry.ipa}`);
        if (entry.grammar_notes) console.log(`      Notes: ${entry.grammar_notes}`);
      }
      if (result.entries.length > 8) {
        console.log(`    ... and ${result.entries.length - 8} more`);
      }
    } else {
      console.log("\n  ⚠ No entries extracted — Claude may not have found vocabulary on this page.");
    }

    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`✗ Vision extraction failed in ${(elapsed / 1000).toFixed(1)}s: ${getErrorMessage(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test 2: Real PDF URL — full pipeline test
// ---------------------------------------------------------------------------

async function testRealPdf(url: string) {
  console.log("\n=== Real PDF Crawl + Extraction Test ===\n");
  console.log(`URL: ${url}\n`);

  // Step 1: Crawl
  console.log("Step 1: Crawling PDF...");
  const start = Date.now();
  const result = await dispatchCrawl(url, "academic", {
    language_code: "haw",
    language_name: "Hawaiian",
  });

  const elapsed = Date.now() - start;

  if (isCrawlError(result)) {
    console.error(`✗ Crawl failed in ${elapsed}ms: ${result.message}`);
    return;
  }

  console.log(`✓ Crawl completed in ${elapsed}ms`);
  console.log(`  Title: ${result.metadata.title}`);
  console.log(`  Text content: ${result.content.length} chars`);

  if (result.visual_content) {
    console.log(`  ✓ SCANNED PDF DETECTED — Vision path triggered`);
    console.log(`    is_scan: ${result.visual_content.is_scan}`);
    if (result.visual_content.pdf_base64) {
      const sizeKB = Math.round((result.visual_content.pdf_base64.length * 3) / 4 / 1024);
      console.log(`    PDF size: ${sizeKB}KB`);
    }
  } else {
    console.log(`  Text PDF — Vision not needed (pdf-parse got ${result.content.length} chars)`);
    return;
  }

  // Step 2: Extract
  console.log("\nStep 2: Vision extraction...");
  const allEntries: ExtractionEntry[] = [];
  const extractStart = Date.now();

  try {
    const extractResult = await runExtractionAgent(
      result.content,
      url,
      result.metadata.title,
      result.metadata.type,
      "haw",
      "Hawaiian",
      (msg, count) => console.log(`  [progress] ${msg} (${count})`),
      async (entries) => {
        allEntries.push(...entries);
        return { saved: entries.length };
      },
      async (patterns) => {
        return { saved: patterns.length };
      },
      undefined,
      result.visual_content
    );

    const extractElapsed = Date.now() - extractStart;
    console.log(`\n✓ Extraction completed in ${(extractElapsed / 1000).toFixed(1)}s`);
    console.log(`  Entries: ${extractResult.entries.length}`);
    console.log(`  Grammar: ${extractResult.grammar_patterns.length}`);

    for (const entry of extractResult.entries.slice(0, 5)) {
      const defs = entry.definitions.map((d) => d.text).join("; ");
      console.log(`    ${entry.headword_native} [${entry.pos}] — ${defs}`);
    }
  } catch (err) {
    console.error(`✗ Extraction failed: ${getErrorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Vision API Extraction Test                         ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY not set. Add it to .env.local");
    process.exit(1);
  }

  const arg = process.argv[2];

  if (arg === "--synthetic" || !arg) {
    const success = await testSyntheticVision();
    if (!success && !arg) {
      console.log("Synthetic test failed. Pass a PDF URL to test the full pipeline:");
      console.log("  npx tsx scripts/test-vision-extraction.ts https://example.com/scan.pdf");
    }
  } else {
    await testRealPdf(arg);
  }

  console.log("\n=== Test complete ===\n");
}

main().catch(console.error);
