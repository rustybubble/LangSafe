import { getErrorMessage } from "../../lib/utils/errors.js";
import { emitEvent } from "../utils/event-emitter.js";
import { indexEntries } from "../utils/http.js";
import {
  runEnrichmentAgent as runAgent,
  type EnrichmentEntry,
  type SourceReliability,
  type CitationReference,
} from "../../lib/agents/enrichment.js";
import { classifySourceType } from "../../lib/apis/source-discovery.js";
import type { VocabularyEntry } from "../types.js";

function toEnrichmentEntry(entry: VocabularyEntry): EnrichmentEntry {
  return {
    id: entry.id,
    headword_native: entry.headword_native,
    headword_romanized: entry.headword_romanized || "",
    pos: entry.pos,
    definitions: entry.definitions,
    semantic_cluster: entry.semantic_cluster,
  };
}

export async function runEnrichment(
  entries: VocabularyEntry[],
  sourceUrls: { url: string; title: string }[],
  languageName: string,
  language_code: string
): Promise<void> {
  if (entries.length === 0) return;

  const enrichEvent = emitEvent("orchestrator", "enrichment", "running", {
    count: entries.length,
    message: `Starting enrichment for ${entries.length} entries...`,
  });

  const enrichmentEntries = entries.map(toEnrichmentEntry);

  const onProgress = (message: string, count: number): void => {
    emitEvent("orchestrator", "enrichment", "running", {
      count,
      message,
    }, enrichEvent.id);
  };

  const onUpdateEntry = async (
    id: string,
    culturalContext: string,
    citationRefs: CitationReference[]
  ): Promise<void> => {
    // Find the original entry to preserve its fields when re-indexing
    const original = entries.find((e) => e.id === id);
    if (!original) return;

    // Merge citation-sourced cross-references with existing ones
    const existingRefs = original.cross_references || [];
    const existingUrls = new Set(existingRefs.map((cr) => cr.source_url));

    const citationCrossRefs = citationRefs
      .filter((cr) => !existingUrls.has(cr.url))
      .map((cr) => {
        let hostname: string;
        try {
          hostname = new URL(cr.url).hostname;
        } catch {
          hostname = cr.url;
        }
        return {
          source_title: hostname,
          source_url: cr.url,
          source_type: classifySourceType(cr.url, cr.claim_text),
          notes: cr.claim_text,
        };
      });

    const updated: VocabularyEntry = {
      ...original,
      cultural_context: culturalContext,
      cross_references: [...existingRefs, ...citationCrossRefs],
    };

    try {
      await indexEntries([updated], language_code);
    } catch (err) {
      console.error(
        `[Enrichment] Failed to update entry ${id}: ${getErrorMessage(err)}`
      );
    }
  };

  const onScoreSource = async (result: SourceReliability): Promise<void> => {
    emitEvent("orchestrator", "enrichment", "running", {
      message: `Source "${result.source_title}" reliability: ${(result.reliability_score * 100).toFixed(0)}%`,
    }, enrichEvent.id);

    // Persist reliability score to entries from this source
    const affectedEntries = entries.filter((e) =>
      e.cross_references?.some((cr) => cr.source_url === result.source_url)
    );
    if (affectedEntries.length === 0) return;

    const updatedEntries: VocabularyEntry[] = affectedEntries.map((e) => ({
      ...e,
      cross_references: (e.cross_references || []).map((cr) =>
        cr.source_url === result.source_url
          ? { ...cr, reliability_score: result.reliability_score }
          : cr
      ),
    }));

    try {
      await indexEntries(updatedEntries, language_code);
    } catch (err) {
      console.error(
        `[Enrichment] Failed to persist reliability for "${result.source_title}": ${getErrorMessage(err)}`
      );
    }
  };

  try {
    const result = await runAgent(
      enrichmentEntries,
      sourceUrls,
      languageName,
      onProgress,
      onUpdateEntry,
      onScoreSource
    );

    emitEvent("orchestrator", "enrichment", "complete", {
      count: result.enriched_count,
      message: `Enrichment complete. ${result.enriched_count} entries enriched, ${result.sources_scored} sources scored.`,
    }, enrichEvent.id);
  } catch (err) {
    emitEvent("orchestrator", "enrichment", "error", {
      message: `Enrichment failed: ${getErrorMessage(err)}`,
    }, enrichEvent.id);
  }
}
