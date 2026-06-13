import { getErrorMessage } from "../lib/utils/errors.js";
import { emitEvent } from "./utils/event-emitter.js";
import { notifyPipelineComplete, notifyNewSourceDiscovered } from "./utils/poke-notifications.js";
import { runDiscoveryAgent } from "./agents/discovery.js";
import { runExtractionAgent } from "./agents/extraction.js";
import { runCrossReferenceAgent } from "./agents/cross-reference.js";
import { runEnrichment } from "./agents/enrichment.js";
import { runPronunciationGeneration } from "./agents/pronunciation.js";
import { getProcessedSourceUrls, bulkUpdateAudioUrl, matchWordClipsToEntries, updatePreservationStatus, getLanguage } from "../lib/elastic.js";
import { indexSourceOutcomes } from "./utils/http.js";
import { invalidateGraphCache } from "../lib/graph.js";
import {
  dispatchCrawl,
  isCrawlError,
  type ExtractionType,
} from "../lib/crawlers/dispatch.js";
import {
  runPreservationPipeline,
  type PipelineCallbacks,
  type PipelineExtractionResult,
  type PipelineSource,
} from "../lib/agents/orchestrator.js";
import { setBrightDataMetrics } from "../lib/brightdata-metrics.js";
import { brightDataMCPConfigured, brightdataScrapeMarkdown } from "../lib/apis/brightdata-mcp.js";
import type {
  PreservationRequest,
  ExtractionResult,
  LanguageMetadata,
  AgentType,
  AgentStatus,
} from "./types.js";
import type { PipelineRunArtifact } from "../lib/types.js";

// ─── Mid-pipeline source injection ───
let injectSourceFn: ((source: PipelineSource) => void) | null = null;

export function injectSource(source: { url: string; title: string; type: string }): boolean {
  if (!injectSourceFn) return false;
  injectSourceFn({ url: source.url, title: source.title, type: source.type });
  return true;
}

export async function runOrchestrator(req: PreservationRequest, signal?: AbortSignal): Promise<void> {
  // Normalize: accept both `language` (old) and `language_name` (new)
  const meta: LanguageMetadata = {
    language_name: req.language_name || req.language || "",
    language_code: req.language_code,
    glottocode: req.glottocode,
    alternate_names: req.alternate_names,
    native_name: req.native_name,
    macroarea: req.macroarea,
    language_family: req.language_family,
    countries: req.countries,
    contact_languages: req.contact_languages,
    endangerment_status: req.endangerment_status,
    speaker_count: req.speaker_count,
  };

  // Auto-enrich metadata from ES languages index
  if (meta.glottocode) {
    try {
      const langEntry = await getLanguage(meta.glottocode);
      if (langEntry) {
        // Fill in missing fields — never overwrite what the frontend sent
        if (!meta.contact_languages?.length && langEntry.contact_languages?.length) {
          meta.contact_languages = langEntry.contact_languages;
        }
        if (!meta.language_family && langEntry.language_family) {
          meta.language_family = langEntry.language_family;
        }
        if (!meta.macroarea && langEntry.macroarea) {
          meta.macroarea = langEntry.macroarea;
        }
        if (!meta.native_name && langEntry.alternate_names?.[0]) {
          meta.native_name = langEntry.alternate_names[0];
        }
        if (!meta.countries?.length && langEntry.countries?.length) {
          meta.countries = langEntry.countries;
        }
        console.log(`  [Auto-enrich] Filled metadata from ES: contact_languages=${meta.contact_languages?.join(", ") || "none"}`);
      }
    } catch (err) {
      console.warn(`  [Auto-enrich] Failed to fetch language from ES: ${getErrorMessage(err)}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  LangSafe Pipeline: ${meta.language_name} (${meta.language_code})`);
  console.log(`${"=".repeat(60)}\n`);

  // Store extraction results per source for cross-referencing
  const extractionResults = new Map<string, ExtractionResult>();

  const callbacks: PipelineCallbacks = {
    onRunDiscovery: async (discoveryMeta, onSource, discoverySignal) => {
      const { stats } = await runDiscoveryAgent(discoveryMeta, (source) => {
        onSource({
          url: source.url,
          title: source.title,
          type: source.type,
          description: source.description,
          discovered_via: source.discovered_via,
        });
      }, discoverySignal);
      return stats;
    },

    onCrawlSource: async (url, type) => {
      const result = await dispatchCrawl(url, (type as ExtractionType) || "generic", {
        language_code: meta.language_code,
        language_name: meta.language_name,
        contact_languages: meta.contact_languages,
        countries: meta.countries,
      });
      if (isCrawlError(result)) {
        throw new Error(result.message);
      }
      return {
        content: result.content,
        title: result.metadata.title,
        type: result.metadata.type,
        audio_urls: result.metadata.audio_urls,
        word_clips: result.metadata.word_clips,
        visual_content: result.visual_content,
        crawl_method: result.metadata.crawl_method,
        brightdata_unlocked: result.metadata.brightdata_unlocked,
        crawl_duration_ms: result.metadata.crawl_duration_ms,
        content_length_bytes: result.metadata.content_length_bytes,
        crawl_strategy: result.metadata.crawl_strategy,
        crawl_pages: result.metadata.crawl_pages,
        browserbase_url: result.metadata.browserbase_url,
      };
    },

    onRunExtraction: async (content, url, title, type, language_code, language_name, onEntriesSaved, linguisticContext, visualContent, extractionSignal) => {
      const crawlResult = { url, title, type, content, visual_content: visualContent, metadata: {} } as Parameters<typeof runExtractionAgent>[0];
      const result = await runExtractionAgent(crawlResult, language_code, language_name, onEntriesSaved, meta.glottocode, linguisticContext, extractionSignal);

      // Store for cross-referencing later
      extractionResults.set(title, result);

      // Non-blocking Poke notification for new source
      if (result.entries.length > 0) {
        notifyNewSourceDiscovered(
          result.source_title,
          result.source_url,
          result.entries.length
        ).catch(() => {}); // skip-and-continue
      }

      return {
        source_url: result.source_url,
        source_title: result.source_title,
        entry_count: result.entries.length,
        audio_count: result.audio_refs.length,
        grammar_count: result.grammar_patterns.length,
      } satisfies PipelineExtractionResult;
    },

    onLinkAudio: async (sourceUrl, audioUrl) => {
      return bulkUpdateAudioUrl(sourceUrl, audioUrl);
    },

    onMatchWordClips: async (sourceUrl, wordClips) => {
      return matchWordClipsToEntries(sourceUrl, wordClips);
    },

    onGetProcessedSources: async (language_code) => {
      return getProcessedSourceUrls(language_code);
    },

    onRunCrossReference: async (sourceTitle, languageName, language_code) => {
      const result = extractionResults.get(sourceTitle);
      if (!result || result.entries.length === 0) {
        return { merged: 0 };
      }

      await runCrossReferenceAgent(result.entries, sourceTitle, languageName, language_code);
      // The cross-reference agent modifies entries in-place and emits its own events
      return { merged: result.entries.length };
    },

    onPipelineReady: (inject) => {
      injectSourceFn = inject;
    },

    onProbeWebUnlocker: brightDataMCPConfigured()
      ? (url, country) => brightdataScrapeMarkdown(url, country)
      : undefined,

    onEvent: (agent, action, status, data, id) => {
      const event = emitEvent(
        agent as AgentType,
        action,
        status as AgentStatus,
        data,
        id
      );
      return event.id;
    },
  };

  let stats;
  try {
    stats = await runPreservationPipeline(
      meta,
      callbacks,
      signal
    );
  } finally {
    injectSourceFn = null;
  }

  // Persist source outcomes regardless of cancellation
  indexSourceOutcomes(stats.sourceOutcomes, meta.language_code)
    .then(({ indexed }) => console.log(`[Orchestrator] Indexed ${indexed} source outcomes`))
    .catch((err) => console.error(`[Orchestrator] Source outcomes indexing failed: ${getErrorMessage(err)}`));

  // Skip post-pipeline work if the pipeline was cancelled
  if (signal?.aborted) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  Pipeline cancelled after ${stats.duration.toFixed(1)}s`);
    console.log(`  Entries preserved: ${stats.entries} | Sources: ${stats.sources}`);
    console.log(`${"=".repeat(60)}\n`);
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Pipeline finished in ${stats.duration.toFixed(1)}s`);
  console.log(`  Entries: ${stats.entries} | Audio: ${stats.audioClips} | Cross-refs: ${stats.crossReferences}`);
  console.log(`  Sources: ${stats.sources} completed`);
  if (stats.brightdata.sources_unlocked > 0 || stats.brightdata.sources_crawled_via_web_unlocker > 0 || stats.brightdata.searches_total > 0) {
    console.log(`  Web Unlocker: ${stats.brightdata.sources_crawled_via_web_unlocker} crawled (${stats.brightdata.sources_unlocked} unlocked) | SERP API: ${stats.brightdata.searches_total} searches`);
  }
  console.log(`${"=".repeat(60)}\n`);

  // Persist BrightData metrics for the dashboard
  const bdCheerio = stats.brightdata.crawl_durations_cheerio;
  const bdWU = stats.brightdata.crawl_durations_web_unlocker;
  setBrightDataMetrics({
    searches_geo_targeted: stats.brightdata.searches_geo_targeted,
    searches_total: stats.brightdata.searches_total,
    scrapes_total: stats.brightdata.scrapes_total,
    sources_discovered_via_serp_api: stats.brightdata.sources_discovered_via_serp_api,
    sources_unlocked: stats.brightdata.sources_unlocked,
    sources_unlocked_urls: stats.brightdata.sources_unlocked_urls,
    sources_crawled_via_web_unlocker: stats.brightdata.sources_crawled_via_web_unlocker,
    avg_crawl_duration_cheerio_ms: bdCheerio.length > 0
      ? Math.round(bdCheerio.reduce((a, b) => a + b, 0) / bdCheerio.length)
      : 0,
    avg_crawl_duration_web_unlocker_ms: bdWU.length > 0
      ? Math.round(bdWU.reduce((a, b) => a + b, 0) / bdWU.length)
      : 0,
    countries_searched: meta.countries || [],
    content_unlocked_bytes: stats.brightdata.content_unlocked_bytes,
    content_standard_bytes: stats.brightdata.content_standard_bytes,
  });

  // Upload pipeline run artifact to R2 (non-blocking)
  const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
  if (CLOUDFLARE_WORKER_URL) {
    const now = new Date();
    const artifactId = now.toISOString();
    const artifact: PipelineRunArtifact = {
      id: artifactId,
      language_code: meta.language_code,
      language_name: meta.language_name,
      glottocode: meta.glottocode,
      started_at: new Date(Date.now() - stats.duration * 1000).toISOString(),
      completed_at: artifactId,
      duration_seconds: stats.duration,
      status: stats.failedSources === stats.totalSources ? "failed" : "completed",
      stats: {
        sources_discovered: stats.totalSources,
        sources_completed: stats.sources,
        sources_failed: stats.failedSources,
        sources_skipped: stats.skippedSources,
        entries_extracted: stats.entries,
        grammar_patterns: stats.grammarPatterns,
        audio_clips: stats.audioClips,
        cross_references: stats.crossReferences,
      },
      sources: stats.sourceOutcomes,
    };

    const r2Key = `runs/${meta.language_code}/${artifactId}.json`;
    fetch(`${CLOUDFLARE_WORKER_URL}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Filename": r2Key,
      },
      body: JSON.stringify(artifact),
      signal: AbortSignal.timeout(10_000),
    })
      .then(() => console.log(`[Artifact] Uploaded run artifact: ${r2Key}`))
      .catch((err) => console.error(`[Artifact] Upload failed: ${getErrorMessage(err)}`));
  }

  // Update preservation_status in the languages index
  if (meta.glottocode) {
    const TYPICAL_VOCAB_SIZE = 20_000;
    const estimatedTotal = meta.speaker_count && meta.speaker_count < 100
      ? 5_000
      : TYPICAL_VOCAB_SIZE;

    try {
      await updatePreservationStatus(meta.glottocode, {
        sources_discovered: stats.sources,
        vocabulary_entries: stats.entries,
        audio_clips: stats.audioClips,
        last_pipeline_run: new Date().toISOString(),
        coverage_percentage: Math.round((stats.entries / estimatedTotal) * 1000) / 10,
      });
      console.log(`  Preservation status updated for ${meta.glottocode}`);
    } catch (err) {
      console.error(`[Orchestrator] Failed to update preservation status: ${getErrorMessage(err)}`);
    }
  }

  // Invalidate graph cache so next load picks up new entries
  invalidateGraphCache();

  // Non-blocking Poke notification
  notifyPipelineComplete(stats.sources, stats.entries, stats.duration).catch(
    () => {} // skip-and-continue
  );

  // Non-blocking enrichment (runs after pipeline, does not block response)
  const allEntries = [...extractionResults.values()].flatMap((r) => r.entries);
  const sourceUrls = [...extractionResults.values()].map((r) => ({
    url: r.source_url,
    title: r.source_title,
  }));

  if (allEntries.length > 0) {
    runEnrichment(allEntries, sourceUrls, meta.language_name, meta.language_code).catch((err) =>
      console.error(`[Enrichment] Failed: ${getErrorMessage(err)}`)
    );
  }

  // Non-blocking pronunciation video generation (HeyGen)
  if (allEntries.length > 0 && process.env.HEYGEN_API_KEY) {
    runPronunciationGeneration(allEntries, meta.language_name, meta.language_code).catch((err) =>
      console.error(`[Pronunciation] Failed: ${getErrorMessage(err)}`)
    );
  }

  // Non-blocking: download and cache any external audio URLs locally
  fetch("http://localhost:3000/api/audio/download", { method: "POST" }).catch(() => {});
}
