import { getErrorMessage } from "../../lib/utils/errors.js";
import { createHash } from "crypto";
import { emitEvent } from "../utils/event-emitter.js";
import { indexEntries, indexGrammarPatterns } from "../utils/http.js";
import { preserveAudioToR2 } from "../utils/audio-preserve.js";
import {
  runExtractionAgent as runAgent,
  type ExtractionEntry,
  type LinguisticContext,
} from "../../lib/agents/extraction-agent.js";
import type { CrawlResult, ExtractionResult, VocabularyEntry, GrammarPattern } from "../types.js";

function deterministicId(native: string, pos: string, language_code: string): string {
  const hash = createHash("sha256")
    .update(`${language_code}::${native}::${pos}`)
    .digest("hex")
    .slice(0, 12);
  return `voc-${hash}`;
}

function toVocabularyEntry(
  entry: ExtractionEntry,
  sourceUrl: string,
  sourceTitle: string,
  sourceType: string,
  language_code: string
): VocabularyEntry {
  const vocab: VocabularyEntry = {
    id: deterministicId(entry.headword_native, entry.pos, language_code),
    headword_native: entry.headword_native,
    headword_romanized: entry.headword_romanized || "",
    pos: entry.pos,
    definitions: entry.definitions ?? [],
    example_sentences: (entry.example_sentences ?? []).map((e) => ({
      ...e,
      source_url: sourceUrl,
    })),
    audio_url: entry.audio_reference,
    related_terms: entry.related_terms ?? [],
    cross_references: [
      {
        source_title: sourceTitle,
        source_url: sourceUrl,
        source_type: sourceType,
      },
    ],
    semantic_cluster: entry.semantic_domain,
  };

  // Map new linguistic fields
  if (entry.ipa) vocab.ipa = entry.ipa;
  if (entry.grammar_notes) vocab.grammar_notes = entry.grammar_notes;
  if (entry.conjugations?.length) vocab.conjugations = entry.conjugations;
  if (entry.morphology) vocab.morphology = entry.morphology;
  if (entry.usage_register || entry.usage_frequency) {
    vocab.usage = {
      register: (entry.usage_register || "dialectal") as "formal" | "informal" | "archaic" | "dialectal" | "literary" | "colloquial",
      frequency: entry.usage_frequency as "common" | "uncommon" | "rare" | undefined,
    };
  }

  // Persist quality signals
  if (entry.language_confidence) vocab.language_confidence = entry.language_confidence;
  vocab.source_count = 1;

  return vocab;
}

export async function runExtractionAgent(
  crawlResult: CrawlResult,
  language_code: string,
  language_name: string,
  onEntriesSaved?: (count: number) => void,
  glottocode?: string,
  linguisticContext?: LinguisticContext,
  signal?: AbortSignal
): Promise<ExtractionResult> {
  const extractEvent = emitEvent("extraction", "extracting_vocabulary", "running", {
    title: crawlResult.title,
    type: crawlResult.type,
    message: `Extracting vocabulary from ${crawlResult.title}...`,
  });

  const onProgress = (message: string, count: number): void => {
    emitEvent("extraction", "extracting_vocabulary", "running", {
      title: crawlResult.title,
      type: crawlResult.type,
      count,
      message,
    }, extractEvent.id);
  };

  // Track entries saved to ES mid-extraction (these survive even if the source times out)
  let savedToES = 0;
  const indexedEntries: VocabularyEntry[] = [];

  const onSaveEntries = async (entries: ExtractionEntry[]): Promise<{ saved: number }> => {
    try {
      // Step 1: Contamination confidence filter (operates on ExtractionEntry before conversion)
      const confidenceFiltered = entries.filter((e) => e.language_confidence !== "low");
      const contaminationDropped = entries.length - confidenceFiltered.length;
      if (contaminationDropped > 0) {
        console.warn(
          `[Extraction] Contamination filter: dropped ${contaminationDropped} low-confidence entries from ${crawlResult.title}`
        );
        emitEvent("extraction", "contamination_filtered", "complete", {
          title: crawlResult.title,
          type: crawlResult.type,
          count: contaminationDropped,
          message: `Filtered ${contaminationDropped} potential contact language entries from ${crawlResult.title}`,
        });
      }
      if (confidenceFiltered.length === 0) return { saved: 0 };

      // Step 2: Convert to VocabularyEntry
      const vocabEntries = confidenceFiltered.map((e) =>
        toVocabularyEntry(e, crawlResult.url, crawlResult.title, crawlResult.type, language_code)
      );

      // Step 3: Verification pass — check headword appears in source text.
      // For vision sources, trust Claude's extraction (headword is in an image, not text).
      const isVisionSource = !!crawlResult.visual_content?.is_scan;
      const verified = isVisionSource
        ? vocabEntries.filter((e) =>
            e.headword_native.length > 0 &&
            e.definitions.some((d) => d.text.length > 0)
          )
        : vocabEntries.filter((e) =>
            crawlResult.content.includes(e.headword_native)
          );
      if (verified.length < vocabEntries.length) {
        console.warn(
          `[Extraction] Filtered ${vocabEntries.length - verified.length} unverified entries from ${crawlResult.title}${isVisionSource ? " (vision)" : ""}`
        );
      }
      if (verified.length === 0) return { saved: 0 };

      // Preserve external audio URLs to R2 (non-blocking per entry)
      const entriesWithAudio = verified.filter(
        (e) => e.audio_url && !e.audio_url.includes("LangSafe-worker")
      );
      if (entriesWithAudio.length > 0) {
        const results = await Promise.allSettled(
          entriesWithAudio.map(async (e) => {
            const r2Url = await preserveAudioToR2(e.audio_url!, language_code);
            if (r2Url) e.audio_url = r2Url;
          })
        );
        const preserved = results.filter((r) => r.status === "fulfilled").length;
        if (preserved > 0) {
          console.log(`[Extraction] Preserved ${preserved} audio files to R2`);
        }
      }

      const result = await indexEntries(verified, language_code, glottocode, language_name);
      if (result.indexed > 0) {
        savedToES += result.indexed;
        indexedEntries.push(...verified.slice(0, result.indexed));
        onEntriesSaved?.(result.indexed);
      }
      return { saved: result.indexed };
    } catch (err) {
      console.error(`[Extraction] Index failed for ${crawlResult.title}: ${getErrorMessage(err)}`);
      return { saved: 0 };
    }
  };

  const onSaveGrammarPatterns = async (patterns: GrammarPattern[]): Promise<{ saved: number }> => {
    try {
      const result = await indexGrammarPatterns(patterns, language_code);
      return { saved: result.indexed };
    } catch (err) {
      console.error(`[Extraction] Grammar index failed for ${crawlResult.title}: ${getErrorMessage(err)}`);
      return { saved: 0 };
    }
  };

  // Emit vision-specific event for scanned sources
  if (crawlResult.visual_content?.is_scan) {
    emitEvent("extraction", "vision_processing", "running", {
      title: crawlResult.title,
      type: crawlResult.type,
      message: `Processing scanned document with Vision API: ${crawlResult.title}`,
    });
  }

  try {
    const result = await runAgent(
      crawlResult.content,
      crawlResult.url,
      crawlResult.title,
      crawlResult.type,
      language_code,
      language_name,
      onProgress,
      onSaveEntries,
      onSaveGrammarPatterns,
      linguisticContext,
      crawlResult.visual_content,
      signal
    );

    // Log token usage
    const tu = result.token_usage;
    console.log(
      `[Extraction] Token usage for "${crawlResult.title}": ${tu.input_tokens} in / ${tu.output_tokens} out / ${tu.cache_read_tokens} cache-read`
    );

    const audioRefs = result.entries
      .map((e) => e.audio_reference)
      .filter((a): a is string => !!a);

    // Use the count from the extraction agent (entries found),
    // but prefer the already-indexed entries (avoids duplicate IDs)
    const entryCount = Math.max(result.entries.length, savedToES);

    // Emit completion — reuse the same event ID so the card updates
    emitEvent("extraction", "extracting_vocabulary", "complete", {
      title: crawlResult.title,
      type: crawlResult.type,
      count: entryCount,
      message: `Extracted ${entryCount} vocabulary entries from ${crawlResult.title}`,
    }, extractEvent.id);

    if (audioRefs.length > 0) {
      emitEvent("extraction", "extracting_audio", "complete", {
        title: crawlResult.title,
        type: crawlResult.type,
        count: audioRefs.length,
        message: `Found ${audioRefs.length} audio references`,
      });
    }

    if (result.grammar_patterns.length > 0) {
      emitEvent("extraction", "extracting_grammar", "complete", {
        title: crawlResult.title,
        type: crawlResult.type,
        count: result.grammar_patterns.length,
        message: `Extracted ${result.grammar_patterns.length} grammar patterns`,
      });
    }

    return {
      source_url: crawlResult.url,
      source_title: crawlResult.title,
      entries: indexedEntries,
      grammar_patterns: result.grammar_patterns,
      audio_refs: audioRefs,
    };
  } catch (err) {
    // Even if the extraction agent throws, entries saved mid-flight are already in ES.
    // Report those instead of 0.
    const entryCount = savedToES;

    emitEvent("extraction", "extracting_vocabulary", entryCount > 0 ? "complete" : "error", {
      title: crawlResult.title,
      type: crawlResult.type,
      count: entryCount,
      message: entryCount > 0
        ? `Extracted ${entryCount} vocabulary entries from ${crawlResult.title} (partial — agent error: ${getErrorMessage(err)})`
        : `Extraction failed: ${getErrorMessage(err)}`,
    }, extractEvent.id);

    return {
      source_url: crawlResult.url,
      source_title: crawlResult.title,
      entries: indexedEntries,
      grammar_patterns: [],
      audio_refs: [],
    };
  }
}
