import { getErrorMessage } from "../utils/errors";
import { createHash } from "crypto";
import { Semaphore } from "../utils/semaphore.js";
import type { LanguageMetadata, PipelineSourceOutcome } from "../types.js";
import type { VisualContent } from "../crawlers/dispatch.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineSource {
  url: string;
  title: string;
  type: string;
  description?: string;
  discovered_via?: "featherless" | "serp_api" | "priority";
}

export interface BrightDataPipelineStats {
  searches_geo_targeted: number;
  searches_total: number;
  scrapes_total: number;
  sources_discovered_via_serp_api: number;
  sources_unlocked: number;
  sources_unlocked_urls: string[];
  sources_crawled_via_web_unlocker: number;
  countries_searched: string[];
  crawl_durations_cheerio: number[];
  crawl_durations_web_unlocker: number[];
  content_unlocked_bytes: number;
  content_standard_bytes: number;
}

export interface PipelineExtractionResult {
  source_url: string;
  source_title: string;
  entry_count: number;
  audio_count: number;
  grammar_count: number;
}

export interface PipelineStats {
  sources: number;
  entries: number;
  crossReferences: number;
  audioClips: number;
  duration: number;
  totalSources: number;
  failedSources: number;
  skippedSources: number;
  grammarPatterns: number;
  sourceOutcomes: PipelineSourceOutcome[];
  brightdata: BrightDataPipelineStats;
}

export interface PipelineCallbacks {
  onRunDiscovery: (
    meta: LanguageMetadata,
    onSource: (source: PipelineSource) => void,
    signal?: AbortSignal
  ) => Promise<{ serp_api_searches?: number; featherless_searches?: number; web_unlocker_scrapes?: number } | void>;

  onCrawlSource: (
    url: string,
    type: string
  ) => Promise<{
    content: string;
    title: string;
    type: string;
    audio_urls?: string[];
    word_clips?: Record<string, string>;
    visual_content?: VisualContent;
    crawl_method?: string;
    brightdata_unlocked?: boolean;
    crawl_duration_ms?: number;
    content_length_bytes?: number;
    // Stagehand observability
    crawl_strategy?: string;
    crawl_pages?: number;
    browserbase_url?: string;
  }>;

  onRunExtraction: (
    content: string,
    url: string,
    title: string,
    type: string,
    language_code: string,
    language_name: string,
    onEntriesSaved?: (count: number) => void,
    linguisticContext?: {
      contact_languages?: string[];
      language_family?: string;
      native_name?: string;
      macroarea?: string;
    },
    visualContent?: VisualContent,
    signal?: AbortSignal
  ) => Promise<PipelineExtractionResult>;

  onGetProcessedSources: (language_code: string) => Promise<Map<string, number>>;

  onRunCrossReference: (
    sourceTitle: string,
    languageName: string,
    language_code: string
  ) => Promise<{ merged: number }>;

  onLinkAudio?: (
    sourceUrl: string,
    audioUrl: string
  ) => Promise<{ updated: number }>;

  onMatchWordClips?: (
    sourceUrl: string,
    wordClips: Record<string, string>
  ) => Promise<{ matched: number }>;

  onEvent: (
    agent: string,
    action: string,
    status: string,
    data: Record<string, unknown>,
    id?: string
  ) => string;

  onPipelineReady?: (injectSource: (source: PipelineSource) => void) => void;

  /** Probe a URL with Web Unlocker for comparison metrics (runs after main pipeline) */
  onProbeWebUnlocker?: (url: string, country?: string) => Promise<string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const SOURCE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per source (base)
const LARGE_CONTENT_THRESHOLD = 50_000; // chars
const EXTRA_TIMEOUT_PER_CHUNK_MS = 60_000; // +1 min per 50K chars over threshold
const PROGRESS_INTERVAL_MS = 30_000; // 30 seconds
const MAX_CONCURRENCY = 5;
const MAX_SOURCES = 25; // Cap total sources to control API costs

// ─── Pipeline runner ─────────────────────────────────────────────────────────

export async function runPreservationPipeline(
  meta: LanguageMetadata,
  callbacks: PipelineCallbacks,
  signal?: AbortSignal
): Promise<PipelineStats> {
  const startTime = Date.now();
  const sem = new Semaphore(MAX_CONCURRENCY);
  const displayName = meta.native_name
    ? `${meta.language_name} (${meta.native_name})`
    : meta.language_name;

  // Mutable stats — accumulated during pipeline
  let completedSources = 0;
  let failedSources = 0;
  let totalEntries = 0;
  let savedEntries = 0; // entries saved mid-extraction (real-time count)
  let totalAudio = 0;
  let totalGrammar = 0;
  let totalCrossRefs = 0;
  let totalSources = 0;
  let skippedSources = 0;
  let discoveryFinished = false;
  const allResults: PipelineExtractionResult[] = [];
  const sourceOutcomes: PipelineSourceOutcome[] = [];
  const contentHashes = new Set<string>();

  // Cheerio-crawled URLs to probe with Web Unlocker after workers drain
  const cheerioUrls: string[] = [];

  // BrightData attribution — accumulated during pipeline
  const bdStats: BrightDataPipelineStats = {
    searches_geo_targeted: 0,
    searches_total: 0,
    scrapes_total: 0,
    sources_discovered_via_serp_api: 0,
    sources_unlocked: 0,
    sources_unlocked_urls: [],
    sources_crawled_via_web_unlocker: 0,
    countries_searched: meta.countries || [],
    crawl_durations_cheerio: [],
    crawl_durations_web_unlocker: [],
    content_unlocked_bytes: 0,
    content_standard_bytes: 0,
  };

  const buildStats = (): PipelineStats => ({
    sources: completedSources,
    entries: Math.max(totalEntries, savedEntries),
    crossReferences: totalCrossRefs,
    audioClips: totalAudio,
    duration: (Date.now() - startTime) / 1000,
    totalSources,
    failedSources,
    skippedSources,
    grammarPatterns: totalGrammar,
    sourceOutcomes,
    brightdata: bdStats,
  });

  // 30-second progress ticker — reuses the same event ID so the card updates in-place
  let tickerEventId: string | undefined;
  const ticker = setInterval(() => {
    const processed = completedSources + failedSources;
    const entryCount = Math.max(totalEntries, savedEntries);
    const message = discoveryFinished
      ? `[${displayName}] Progress: ${processed}/${totalSources} sources processed, ${entryCount} entries extracted`
      : `[${displayName}] Progress: ${processed} sources processed (${totalSources} discovered so far, still searching...), ${entryCount} entries extracted`;

    tickerEventId = callbacks.onEvent("orchestrator", "progress_update", "running", {
      message,
      count: entryCount,
    }, tickerEventId);
  }, PROGRESS_INTERVAL_MS);

  // Stop the ticker if the pipeline is cancelled
  if (signal) {
    signal.addEventListener("abort", () => clearInterval(ticker), { once: true });
  }

  const pipelineWork = async (): Promise<PipelineStats> => {
    // Step 1: Session started
    callbacks.onEvent("orchestrator", "session_started", "complete", {
      message: `Starting preservation pipeline for ${displayName}...`,
    });

    // Step 1.5: Fetch already-processed source URLs to avoid re-extracting
    let processedSources = new Map<string, number>();
    try {
      processedSources = await callbacks.onGetProcessedSources(meta.language_code);
      if (processedSources.size > 0) {
        callbacks.onEvent("orchestrator", "progress_update", "complete", {
          message: `Found ${processedSources.size} previously processed sources — will skip duplicates.`,
          count: processedSources.size,
        });
      }
    } catch {
      // Non-fatal — proceed without dedup
    }

    // ── Streaming worker pool ──
    // Workers are launched as sources are discovered, not after discovery completes.
    const workerPromises: Promise<void>[] = [];

    let acceptedSources = 0;

    const processSource = (source: PipelineSource): void => {
      totalSources++;

      // Enforce source cap to control API costs
      if (acceptedSources >= MAX_SOURCES) {
        skippedSources++;
        sourceOutcomes.push({ url: source.url, title: source.title, type: source.type, status: "skipped_source_cap" });
        callbacks.onEvent("orchestrator", "source_cap", "complete", {
          url: source.url,
          message: `Skipped "${source.title}" — reached source cap of ${MAX_SOURCES}`,
        });
        return;
      }
      acceptedSources++;

      if (source.discovered_via === "serp_api") {
        bdStats.sources_discovered_via_serp_api++;
      }

      const workerPromise = (async () => {
        // Skip if pipeline was cancelled
        if (signal?.aborted) {
          skippedSources++;
          sourceOutcomes.push({ url: source.url, title: source.title, type: source.type, status: "cancelled" });
          return;
        }

        await sem.acquire();

        // Check again after acquiring (may have been cancelled while waiting)
        if (signal?.aborted) {
          sem.release();
          skippedSources++;
          sourceOutcomes.push({ url: source.url, title: source.title, type: source.type, status: "cancelled" });
          return;
        }

        // Skip sources we've already extracted entries from
        const existingCount = processedSources.get(source.url);
        if (existingCount && existingCount > 0) {
          skippedSources++;
          completedSources++;
          sourceOutcomes.push({
            url: source.url, title: source.title, type: source.type,
            status: "skipped_duplicate", entry_count: existingCount,
          });
          callbacks.onEvent("orchestrator", "progress_update", "complete", {
            url: source.url,
            title: source.title,
            message: `Skipped ${source.title} — already have ${existingCount} entries from previous run`,
            count: existingCount,
          });
          sem.release();
          return;
        }

        const sourceEventId = callbacks.onEvent("orchestrator", "progress_update", "running", {
          url: source.url,
          title: source.title,
          message: `Crawling ${source.title}...`,
        });

        // Extraction result captured here so cross-ref can run after semaphore release
        let extractionResult: PipelineExtractionResult | null = null;

        try {
          // Crawl
          let crawlResult: Awaited<ReturnType<typeof callbacks.onCrawlSource>>;
          try {
            crawlResult = await callbacks.onCrawlSource(source.url, source.type);
          } catch (err) {
            failedSources++;
            sourceOutcomes.push({
              url: source.url, title: source.title, type: source.type,
              status: "failed", error: `Crawl failed: ${getErrorMessage(err)}`,
            });
            callbacks.onEvent("extraction", "extracting_vocabulary", "error", {
              url: source.url,
              title: source.title,
              message: `Could not access ${source.title}, skipping: ${getErrorMessage(err)}`,
            }, sourceEventId);
            return;
          }

          // ── BrightData crawl attribution ──
          if (crawlResult.crawl_method === "web_unlocker") {
            bdStats.sources_crawled_via_web_unlocker++;
            if (crawlResult.crawl_duration_ms) {
              bdStats.crawl_durations_web_unlocker.push(crawlResult.crawl_duration_ms);
            }
            if (crawlResult.content_length_bytes) {
              bdStats.content_unlocked_bytes += crawlResult.content_length_bytes;
            }
          } else if (crawlResult.crawl_method === "cheerio") {
            if (crawlResult.crawl_duration_ms) {
              bdStats.crawl_durations_cheerio.push(crawlResult.crawl_duration_ms);
            }
            if (crawlResult.content_length_bytes) {
              bdStats.content_standard_bytes += crawlResult.content_length_bytes;
            }
            // Collect for post-pipeline Web Unlocker comparison probes
            if (cheerioUrls.length < 5) {
              cheerioUrls.push(source.url);
            }
          }
          if (crawlResult.brightdata_unlocked) {
            bdStats.sources_unlocked++;
            bdStats.sources_unlocked_urls.push(source.url);
            callbacks.onEvent("orchestrator", "brightdata_unlock", "complete", {
              url: source.url,
              title: source.title,
              message: `Web Unlocker unlocked ${source.title} — standard fetch failed but BrightData Web Unlocker succeeded`,
              crawl_method: crawlResult.crawl_method,
              brightdata_unlocked: true,
            });
          }

          // Bail if cancelled during crawl
          if (signal?.aborted) {
            sourceOutcomes.push({ url: source.url, title: source.title, type: source.type, status: "cancelled" });
            return;
          }

          // Content-hash dedup: skip if identical content already extracted from another URL
          const contentHash = createHash("sha256").update(crawlResult.content).digest("hex");
          if (contentHashes.has(contentHash)) {
            completedSources++;
            skippedSources++;
            sourceOutcomes.push({
              url: source.url, title: source.title, type: source.type,
              status: "skipped_content_hash",
            });
            callbacks.onEvent("orchestrator", "progress_update", "complete", {
              url: source.url,
              title: source.title,
              message: `Skipped ${source.title} — identical content already extracted from another URL`,
            }, sourceEventId);
            return;
          }
          contentHashes.add(contentHash);

          // Extract (with per-source timeout)
          try {
            callbacks.onEvent("orchestrator", "progress_update", "running", {
              url: source.url,
              title: source.title,
              message: `Processing content from ${source.title}...`,
              crawl_method: crawlResult.crawl_method,
              crawl_strategy: crawlResult.crawl_strategy,
              crawl_pages: crawlResult.crawl_pages,
              browserbase_url: crawlResult.browserbase_url,
            }, sourceEventId);

            // Dynamic timeout: base 3 min + 1 min per 50K chars
            // Video sources get +7 min for ML pipeline (download + chunk + transcribe + correct)
            const contentLen = crawlResult.content.length;
            const extraChunks = Math.max(0, Math.ceil((contentLen - LARGE_CONTENT_THRESHOLD) / LARGE_CONTENT_THRESHOLD));
            const isVideoSource = crawlResult.type === "video";
            const isVisionSource = !!crawlResult.visual_content?.is_scan;
            const videoExtraMs = isVideoSource ? 7 * 60 * 1000 : 0;
            const visionExtraMs = isVisionSource ? 5 * 60 * 1000 : 0;
            const timeoutMs = SOURCE_TIMEOUT_MS + extraChunks * EXTRA_TIMEOUT_PER_CHUNK_MS + videoExtraMs + visionExtraMs;

            const result = await Promise.race([
              callbacks.onRunExtraction(
                crawlResult.content,
                source.url,
                crawlResult.title || source.title,
                crawlResult.type || source.type,
                meta.language_code,
                meta.language_name,
                (count) => { savedEntries += count; },
                {
                  contact_languages: meta.contact_languages,
                  language_family: meta.language_family,
                  native_name: meta.native_name,
                  macroarea: meta.macroarea,
                },
                crawlResult.visual_content,
                signal
              ),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Source extraction timed out after ${timeoutMs / 1000}s`)),
                  timeoutMs
                )
              ),
            ]);

            allResults.push(result);
            completedSources++;
            totalEntries += result.entry_count;
            totalAudio += result.audio_count;
            totalGrammar += result.grammar_count;
            extractionResult = result;
            sourceOutcomes.push({
              url: source.url, title: source.title, type: source.type,
              status: "extracted",
              entry_count: result.entry_count,
              grammar_count: result.grammar_count,
              audio_count: result.audio_count,
            });

            callbacks.onEvent("orchestrator", "progress_update", "complete", {
              url: source.url,
              title: source.title,
              message: `Extracted ${result.entry_count} entries from ${source.title}`,
              count: result.entry_count,
            }, sourceEventId);

            // Link audio URLs from video sources to extracted entries
            if (crawlResult.audio_urls && crawlResult.audio_urls.length > 0 && result.entry_count > 0 && callbacks.onLinkAudio) {
              try {
                const linkResult = await callbacks.onLinkAudio(source.url, crawlResult.audio_urls[0]);
                if (linkResult.updated > 0) {
                  totalAudio += linkResult.updated;
                  callbacks.onEvent("extraction", "audio_linked", "complete", {
                    url: source.url,
                    title: source.title,
                    message: `Linked audio to ${linkResult.updated} entries from ${source.title}`,
                    count: linkResult.updated,
                  });
                }
              } catch (err) {
                console.error(
                  `[Orchestrator] Audio linking failed for ${source.url}: ${getErrorMessage(err)}`
                );
              }
            }

            // Match word-level audio clips to individual entries
            if (crawlResult.word_clips && Object.keys(crawlResult.word_clips).length > 0 && result.entry_count > 0 && callbacks.onMatchWordClips) {
              try {
                const matchResult = await callbacks.onMatchWordClips(source.url, crawlResult.word_clips);
                if (matchResult.matched > 0) {
                  callbacks.onEvent("extraction", "word_audio_matched", "complete", {
                    url: source.url,
                    title: source.title,
                    message: `Matched ${matchResult.matched} word pronunciation clips to entries`,
                    count: matchResult.matched,
                  });
                }
              } catch (err) {
                console.error(
                  `[Orchestrator] Word clip matching failed for ${source.url}: ${getErrorMessage(err)}`
                );
              }
            }
          } catch (err) {
            failedSources++;
            sourceOutcomes.push({
              url: source.url, title: source.title, type: source.type,
              status: "failed", error: `Extraction failed: ${getErrorMessage(err)}`,
            });
            callbacks.onEvent("extraction", "extracting_vocabulary", "error", {
              url: source.url,
              title: source.title,
              message: `Extraction failed: ${getErrorMessage(err)}`,
            }, sourceEventId);
          }
        } finally {
          sem.release();
        }

        // Cross-reference runs after semaphore release — doesn't block other source extractions
        if (signal?.aborted) return;
        if (extractionResult && extractionResult.entry_count > 0) {
          try {
            callbacks.onEvent("orchestrator", "progress_update", "running", {
              url: source.url,
              title: source.title,
              message: `Cross-referencing ${extractionResult.entry_count} entries from ${source.title}...`,
            }, sourceEventId);

            const crossRefResult = await callbacks.onRunCrossReference(
              extractionResult.source_title,
              meta.language_name,
              meta.language_code
            );
            totalCrossRefs += crossRefResult.merged;
          } catch (err) {
            console.error(
              `[Orchestrator] Cross-ref failed for ${extractionResult.source_title}: ${getErrorMessage(err)}`
            );
          }
        }
      })();

      workerPromises.push(workerPromise);
    };

    // Expose processSource for mid-pipeline source injection
    callbacks.onPipelineReady?.(processSource);

    // Step 2: Discovery — streams sources via processSource callback
    try {
      const discoveryResult = await callbacks.onRunDiscovery(meta, processSource, signal);
      // Merge BrightData discovery stats
      if (discoveryResult) {
        bdStats.searches_total += (discoveryResult.serp_api_searches || 0);
        bdStats.searches_geo_targeted += (discoveryResult.serp_api_searches || 0);
        bdStats.scrapes_total += (discoveryResult.web_unlocker_scrapes || 0);
      }
    } catch (err) {
      // Partial failure: some sources may already be queued — let them finish
      callbacks.onEvent("orchestrator", "progress_update", "error", {
        message: `Discovery failed: ${getErrorMessage(err)}. Processing ${workerPromises.length} sources already found.`,
      });
    }
    discoveryFinished = true;

    if (totalSources === 0) {
      callbacks.onEvent("orchestrator", "progress_update", "error", {
        message: "No sources discovered. Pipeline cannot continue.",
      });
      return buildStats();
    }

    callbacks.onEvent("orchestrator", "progress_update", "complete", {
      message: `[${displayName}] Discovery complete. Found ${totalSources} sources. ${completedSources + failedSources} already processed, ${totalSources - (completedSources + failedSources)} still in flight...`,
      count: totalSources,
    });

    // Step 3: Drain worker pool — keep settling until no new workers appear
    // (handles sources injected mid-pipeline via onPipelineReady)
    let lastSettled = 0;
    while (lastSettled < workerPromises.length) {
      const batch = workerPromises.slice(lastSettled);
      await Promise.allSettled(batch);
      lastSettled += batch.length;
    }

    // If cancelled, emit summary and return early (skip probes/enrichment)
    if (signal?.aborted) {
      clearInterval(ticker);
      const stats = buildStats();
      const cancelledNote = skippedSources > 0 ? ` ${skippedSources} sources skipped.` : "";
      callbacks.onEvent("orchestrator", "pipeline_cancelled", "complete", {
        message: `[${displayName}] Pipeline stopped by user. ${stats.entries} entries preserved from ${completedSources} sources.${cancelledNote} Duration: ${stats.duration.toFixed(1)}s`,
        count: stats.entries,
      });
      return stats;
    }

    // ── Web Unlocker verification probes (comparison metrics, non-blocking) ──
    if (cheerioUrls.length > 0 && callbacks.onProbeWebUnlocker) {
      callbacks.onEvent("orchestrator", "web_unlocker_probe", "running", {
        message: `Running Web Unlocker verification on ${cheerioUrls.length} sources for comparison metrics...`,
      });

      const probeResults = await Promise.allSettled(
        cheerioUrls.map(async (url) => {
          const start = Date.now();
          const content = await callbacks.onProbeWebUnlocker!(url, meta.countries?.[0]);
          return { url, duration: Date.now() - start, contentLength: content.length };
        })
      );

      for (const result of probeResults) {
        if (result.status === "fulfilled") {
          bdStats.sources_crawled_via_web_unlocker++;
          bdStats.crawl_durations_web_unlocker.push(result.value.duration);
          bdStats.content_unlocked_bytes += result.value.contentLength;
        }
      }

      const succeeded = probeResults.filter(r => r.status === "fulfilled").length;
      callbacks.onEvent("orchestrator", "web_unlocker_probe", "complete", {
        message: `Web Unlocker verified ${succeeded}/${cheerioUrls.length} sources.`,
      });
    }

    // Resolve the ticker event if it exists
    if (tickerEventId) {
      callbacks.onEvent("orchestrator", "progress_update", "complete", {
        message: `Processing complete. ${completedSources + failedSources}/${totalSources} sources processed.`,
        count: totalEntries,
      }, tickerEventId);
    }

    // Cross-referencing now happens inline per-source (inside worker, after extraction)

    // Notify that embedding backfill is running in the background
    if (totalEntries > 0 || savedEntries > 0) {
      callbacks.onEvent("orchestrator", "embedding_backfill", "running", {
        message: "Semantic search embeddings are being generated in the background...",
        count: Math.max(totalEntries, savedEntries),
      });
    }

    // Step 4: Final summary
    const stats = buildStats();

    const skippedNote = skippedSources > 0 ? `, ${skippedSources} skipped (already processed)` : "";
    const bdNote = bdStats.sources_unlocked > 0
      ? ` BrightData Web Unlocker unlocked ${bdStats.sources_unlocked} protected sources (${(bdStats.content_unlocked_bytes / 1024).toFixed(1)} KB).`
      : "";
    callbacks.onEvent("orchestrator", "pipeline_complete", "complete", {
      message: `[${displayName}] Preservation complete. Discovered ${totalSources} sources, extracted ${stats.entries} entries, linked ${stats.crossReferences} cross-references. ${stats.audioClips} audio clips, ${totalGrammar} grammar patterns from ${completedSources} sources${failedSources > 0 ? ` (${failedSources} failed)` : ""}${skippedNote}.${bdNote} Duration: ${stats.duration.toFixed(1)}s`,
      count: stats.entries,
    });

    return stats;
  };

  // Race the pipeline against the 5-minute timeout
  try {
    const stats = await Promise.race([
      pipelineWork(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Pipeline timeout exceeded (5 minutes)")),
          PIPELINE_TIMEOUT_MS
        )
      ),
    ]);

    clearInterval(ticker);
    return stats;
  } catch (err) {
    clearInterval(ticker);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    callbacks.onEvent("orchestrator", "pipeline_complete", "error", {
      message: `Pipeline stopped after ${elapsed}s: ${getErrorMessage(err)}`,
    });

    return buildStats();
  }
}
