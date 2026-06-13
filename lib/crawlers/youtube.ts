/**
 * Standalone Jeju YouTube crawler (Stagehand-based).
 *
 * This crawler searches YouTube for Jejueo-specific content using hardcoded
 * search queries. It is NOT used by the multi-language pipeline — the dispatch
 * system uses crawlYouTubeLite() in dispatch.ts instead, which is language-agnostic.
 *
 * Usage: npx tsx lib/crawlers/youtube.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { getStagehandModelConfig } from "../apis/stagehand-model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LanguageVideo {
  video_url: string;
  title: string;
  channel_name: string;
  view_count: string;
  description: string;
  has_captions: boolean;
  caption_text?: string;
  search_query: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JEJU_SEARCH_QUERIES = ["제주어", "제주 방언", "Jejueo"];
const EXTRACT_TIMEOUT_MS = 60_000;
const CAPTION_CHECK_LIMIT = 3;

interface RawVideoResult {
  title: string;
  channel_name: string;
  view_count: string;
  video_id: string;
  description: string;
}

const CaptionCheckSchema = z.object({
  has_captions: z
    .boolean()
    .describe(
      "Whether this video has subtitles/closed captions available (look for a CC button or subtitle options in the video player)"
    ),
  caption_sample: z
    .string()
    .optional()
    .describe(
      "If captions are visible on screen, extract a sample of the caption text (first few lines)"
    ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function isSessionClosed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("CDP transport closed") ||
    msg.includes("no page available") ||
    msg.includes("Session closed") ||
    msg.includes("Target closed") ||
    msg.includes("Protocol error") ||
    msg.includes("terminated") ||
    msg.includes("Failed to connect")
  );
}

function isLoadStateTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("waitForMainLoadState");
}

function deduplicateVideos(videos: LanguageVideo[]): LanguageVideo[] {
  const seen = new Set<string>();
  return videos.filter((v) => {
    if (seen.has(v.video_url)) return false;
    seen.add(v.video_url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main crawler
// ---------------------------------------------------------------------------

export async function crawlYouTube(
  searchQueries: string[] = JEJU_SEARCH_QUERIES
): Promise<LanguageVideo[]> {
  console.log("[youtube] Starting Stagehand YouTube crawler...");

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

  // Browserbase datacenter IPs are blocked by YouTube — use LOCAL by default.
  // Set STAGEHAND_ENV=BROWSERBASE to override (requires Enterprise advancedStealth).
  const useBrowserbase = process.env.STAGEHAND_ENV === "BROWSERBASE";
  const stagehand = new Stagehand({
    env: useBrowserbase ? "BROWSERBASE" : "LOCAL",
    ...(useBrowserbase
      ? {
          apiKey: process.env.BROWSERBASE_API_KEY,
          projectId: process.env.BROWSERBASE_PROJECT_ID,
          browserbaseSessionCreateParams: {
            timeout: 600,
            keepAlive: true,
          },
        }
      : {
          localBrowserLaunchOptions: {
            headless: true,
            viewport: { width: 1280, height: 720 },
          },
        }),
    model: getStagehandModelConfig(),
    verbose: 0,
    domSettleTimeout: 3000,
  });

  const allVideos: LanguageVideo[] = [];
  let sessionAlive = true;

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // --- Warmup: visit YouTube to handle cookie consent / initial load ---
    console.log("[youtube] Warming up YouTube session...");
    try {
      await page.goto("https://www.youtube.com", {
        waitUntil: "domcontentloaded",
        timeoutMs: 30_000,
      });
    } catch (err) {
      if (isSessionClosed(err)) throw err;
      // Load state timeouts are OK — the page may still have loaded
      if (isLoadStateTimeout(err)) {
        console.warn("[youtube] Warmup load state timeout (continuing)");
      } else {
        console.warn(
          `[youtube] Warmup nav error: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    // Accept cookie consent if present
    try {
      await page.waitForTimeout(2000);
      await stagehand.act("Click the Accept or Reject button on the cookie consent dialog if one is visible");
      console.log("[youtube] Handled cookie consent dialog");
      await page.waitForTimeout(1000);
    } catch {
      // No consent dialog — fine
    }

    // --- Phase 1: Search and extract video metadata ---
    for (const query of searchQueries) {
      if (!sessionAlive) break;

      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      console.log(`[youtube] Searching: "${query}"...`);

      try {
        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeoutMs: 30_000,
        });
      } catch (err) {
        if (isSessionClosed(err)) {
          console.warn("[youtube] Session closed during navigation.");
          sessionAlive = false;
          break;
        }
        if (isLoadStateTimeout(err)) {
          console.warn(
            `[youtube] Load state timeout for "${query}" — attempting extraction anyway`
          );
        } else {
          console.warn(
            `[youtube] Navigation error for "${query}": ${err instanceof Error ? err.message : err}`
          );
          continue;
        }
      }
      await page.waitForTimeout(3000);

      try {
        const results = await page.evaluate(() => {
          const renderers = document.querySelectorAll("ytd-video-renderer");
          return Array.from(renderers)
            .slice(0, 10)
            .map((el) => {
              const titleEl = el.querySelector(
                "#video-title"
              ) as HTMLAnchorElement | null;
              const href = titleEl?.href ?? "";
              const match = href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
              const channelEl = el.querySelector(
                "ytd-channel-name #text-container yt-formatted-string, ytd-channel-name #text"
              );
              const metaLine = el.querySelectorAll(
                "#metadata-line span.inline-metadata-item"
              );
              const descEl = el.querySelector(
                ".metadata-snippet-text, #description-text"
              );
              return {
                title: titleEl?.textContent?.trim() ?? "",
                channel_name: channelEl?.textContent?.trim() ?? "",
                view_count: metaLine[0]?.textContent?.trim() ?? "",
                video_id: match?.[1] ?? "",
                description: descEl?.textContent?.trim() ?? "",
              };
            })
            .filter(
              (v): v is typeof v & { video_id: string } =>
                v.video_id !== "" && v.title !== ""
            );
        });

        if (results.length > 0) {
          console.log(
            `   Found ${results.length} videos for "${query}"`
          );
          for (const r of results) {
            allVideos.push({
              video_url: `https://www.youtube.com/watch?v=${r.video_id}`,
              title: r.title,
              channel_name: r.channel_name,
              view_count: r.view_count,
              description: r.description,
              has_captions: false,
              search_query: query,
            });
          }
        } else {
          console.log(`   No video results for "${query}"`);
        }
      } catch (err) {
        if (isSessionClosed(err)) {
          console.warn("[youtube] Session closed during extraction.");
          sessionAlive = false;
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`   Extraction error for "${query}": ${msg.slice(0, 100)}`);
      }
    }

    // --- Phase 2: Check captions on a few videos ---
    const unique = deduplicateVideos(allVideos);
    const toCheck = unique.slice(0, CAPTION_CHECK_LIMIT);

    if (sessionAlive && toCheck.length > 0) {
      console.log(
        `[youtube] Checking captions on ${toCheck.length} videos...`
      );

      for (const video of toCheck) {
        if (!sessionAlive) break;

        try {
          console.log(`   Checking: ${video.title.slice(0, 50)}...`);
          try {
            await page.goto(video.video_url, {
              waitUntil: "domcontentloaded",
              timeoutMs: 30_000,
            });
          } catch (navErr) {
            if (isSessionClosed(navErr)) throw navErr;
            if (!isLoadStateTimeout(navErr)) throw navErr;
            console.warn(`     Load state timeout — attempting check anyway`);
          }
          await page.waitForTimeout(3000);

          const captionInfo = await withTimeout(
            stagehand.extract(
              `Check if this YouTube video has subtitles or closed captions available.
Look for a CC button in the video player controls, or any subtitle/caption indicator.
If captions are currently visible on screen, extract a sample of the text.`,
              CaptionCheckSchema
            ),
            EXTRACT_TIMEOUT_MS,
            `caption check: ${video.title.slice(0, 30)}`
          );

          if (captionInfo) {
            video.has_captions = captionInfo.has_captions;
            if (captionInfo.caption_sample) {
              video.caption_text = captionInfo.caption_sample;
            }
            console.log(
              `     Captions: ${captionInfo.has_captions ? "YES" : "no"}`
            );
          }
        } catch (err) {
          if (isSessionClosed(err)) {
            console.warn("[youtube] Session closed during caption check.");
            sessionAlive = false;
            break;
          }
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`     Caption check error: ${msg.slice(0, 80)}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[youtube] Crawler error: ${msg}`);
  } finally {
    try {
      await stagehand.close();
    } catch {
      // Ignore
    }
    process.removeListener("unhandledRejection", rejectionHandler);
    if (suppressedErrors.length > 0) {
      console.log(
        `[youtube] Suppressed ${suppressedErrors.length} CDP error(s).`
      );
    }
  }

  const deduplicated = deduplicateVideos(allVideos);
  console.log(
    `[youtube] Done. ${allVideos.length} raw → ${deduplicated.length} unique videos`
  );

  return deduplicated;
}

// ---------------------------------------------------------------------------
// Test function
// ---------------------------------------------------------------------------

export async function testCrawl(): Promise<void> {
  console.log("=== YouTube Language Video Crawler Test ===\n");

  try {
    const videos = await crawlYouTube(JEJU_SEARCH_QUERIES);

    if (videos.length === 0) {
      console.error("No videos discovered.");
      process.exit(1);
    }

    console.log(`\nTotal videos discovered: ${videos.length}\n`);
    console.log("Videos:");
    console.log("-".repeat(70));

    for (const video of videos) {
      const captions = video.has_captions ? " [CC]" : "";
      console.log(
        `  ${video.title.slice(0, 55)}${captions}`
      );
      console.log(
        `    ${video.channel_name} | ${video.view_count} | query: "${video.search_query}"`
      );
      console.log(`    ${video.video_url}`);
      if (video.caption_text) {
        console.log(
          `    Caption sample: "${video.caption_text.slice(0, 80)}..."`
        );
      }
      console.log();
    }

    console.log("-".repeat(70));
    console.log(`\nSample full entry (JSON):`);
    console.log(JSON.stringify(videos[0], null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Crawl failed: ${msg}`);
    process.exit(1);
  }
}

// Run test if executed directly
const isDirectRun = process.argv[1]?.includes("youtube");
if (isDirectRun) {
  testCrawl();
}
