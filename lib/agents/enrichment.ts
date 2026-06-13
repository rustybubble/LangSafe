import { getErrorMessage } from "../utils/errors";
import { parseCitations, type CitationReference } from "../utils/citations.js";
import { featherlessChatText } from "../apis/featherless.js";

export type { CitationReference };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnrichmentEntry {
  id: string;
  headword_native: string;
  headword_romanized?: string;
  pos: string;
  definitions: { language: string; text: string }[];
  semantic_cluster?: string;
}

export interface SourceReliability {
  source_url: string;
  source_title: string;
  reliability_score: number;
  assessment: string;
}

export interface EnrichmentResult {
  enriched_count: number;
  sources_scored: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TOKENS = 1024;
const TIMEOUT_MS = 15_000;
const MAX_FEATHERLESS_CALLS = 10;
const MAX_CULTURAL = 7;
const MAX_RELIABILITY = 3;

const HIGH_CULTURAL_DOMAINS = new Set([
  "maritime",
  "rituals",
  "kinship",
  "agriculture",
  "food",
  "nature",
  "weather",
  "animals",
  "plants",
  "geography",
]);

// ─── Featherless query helper (prose-mode, no JSON parsing) ──────────────────

interface FeatherlessProseResult {
  text: string;
  citations: string[];
}

async function queryFeatherless(prompt: string, languageName: string): Promise<FeatherlessProseResult> {
  const text = await featherlessChatText({
    system: `You are a knowledgeable expert on the ${languageName} language, its cultural context, and endangered language preservation. Provide concise, careful responses. If a fact is uncertain, say so.`,
    prompt,
    maxTokens: MAX_TOKENS,
    temperature: 0.2,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return {
    text,
    citations: [],
  };
}

// ─── Entry prioritization ───────────────────────────────────────────────────

function selectEntries(
  entries: EnrichmentEntry[],
  limit: number
): EnrichmentEntry[] {
  // Score each entry: high-cultural domain = +10, definition count = +N
  const scored = entries.map((e) => ({
    entry: e,
    score:
      (e.semantic_cluster && HIGH_CULTURAL_DOMAINS.has(e.semantic_cluster)
        ? 10
        : 0) + e.definitions.length,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

// ─── Reliability scoring heuristic ──────────────────────────────────────────

function scoreReliability(text: string): number {
  const lower = text.toLowerCase();

  if (/unreliable|inaccurate|questionable|dubious/.test(lower)) return 0.3;
  if (/university|peer.?review|linguist|professor|phd/.test(lower)) return 0.9;
  if (/government|institute|official|national/.test(lower)) return 0.8;
  if (/dictionary|comprehensive|authoritative/.test(lower)) return 0.75;
  if (/community|volunteer|blog|personal/.test(lower)) return 0.5;

  return 0.6;
}

// ─── Agent runner ────────────────────────────────────────────────────────────

export async function runEnrichmentAgent(
  entries: EnrichmentEntry[],
  sourceUrls: { url: string; title: string }[],
  languageName: string,
  onProgress: (message: string, count: number) => void,
  onUpdateEntry: (id: string, culturalContext: string, citationRefs: CitationReference[]) => Promise<void>,
  onScoreSource: (result: SourceReliability) => Promise<void>
): Promise<EnrichmentResult> {
  let callsUsed = 0;
  let enrichedCount = 0;
  let sourcesScored = 0;

  // Determine budget split based on input
  const culturalBudget = Math.min(
    MAX_CULTURAL,
    entries.length,
    MAX_FEATHERLESS_CALLS
  );
  const reliabilityBudget = Math.min(
    MAX_RELIABILITY,
    sourceUrls.length,
    MAX_FEATHERLESS_CALLS - culturalBudget
  );

  onProgress(
    `Enriching entries with cultural context (${culturalBudget} entries, ${reliabilityBudget} sources)...`,
    0
  );

  // Phase 1: Cultural enrichment
  const selectedEntries = selectEntries(entries, culturalBudget);

  for (const entry of selectedEntries) {
    if (callsUsed >= MAX_FEATHERLESS_CALLS) break;

    onProgress(
      `Enriching '${entry.headword_native}' with cultural context...`,
      enrichedCount
    );

    try {
      const defText = entry.definitions
        .map((d) => d.text)
        .join("; ");

      const modelResult = await queryFeatherless(
        `Cultural significance and etymology of the ${languageName} word "${entry.headword_native}" (${entry.headword_romanized}), meaning: ${defText}. Provide historical context, cultural connections, and any traditional or regional significance. Be concise (2-3 sentences).`,
        languageName
      );
      callsUsed++;

      if (modelResult.text) {
        // Parse inline [N] citations into structured references
        const parsed = parseCitations(modelResult.text, modelResult.citations);

        // Trim to ~500 chars if very long
        const culturalContext =
          parsed.cleaned_text.length > 500
            ? parsed.cleaned_text.slice(0, 497) + "..."
            : parsed.cleaned_text;

        await onUpdateEntry(entry.id, culturalContext, parsed.citation_references);
        enrichedCount++;

        if (parsed.citation_references.length > 0) {
          console.log(
            `[Enrichment] Resolved ${parsed.citation_references.length} citation(s) for "${entry.headword_native}"`
          );
        }
      }
    } catch (err) {
      console.warn(
        `[Enrichment] Failed to enrich "${entry.headword_native}": ${getErrorMessage(err)}`
      );
    }
  }

  // Phase 2: Source reliability scoring
  const uniqueSources = new Map<string, { url: string; title: string }>();
  for (const s of sourceUrls) {
    if (!uniqueSources.has(s.url)) {
      uniqueSources.set(s.url, s);
    }
  }

  const sourcesToScore = [...uniqueSources.values()].slice(
    0,
    reliabilityBudget
  );

  for (const source of sourcesToScore) {
    if (callsUsed >= MAX_FEATHERLESS_CALLS) break;

    onProgress(
      `Scoring reliability of '${source.title}'...`,
      enrichedCount
    );

    try {
      const modelResult = await queryFeatherless(
        `How authoritative is ${source.url} as a linguistic resource for the ${languageName} language? Who created it? Is it peer-reviewed, government-backed, or community-created? Answer in 2-3 sentences.`,
        languageName
      );
      callsUsed++;

      // Clean [N] markers from assessment text
      const parsed = parseCitations(modelResult.text, modelResult.citations);
      const assessmentText = parsed.cleaned_text;

      const reliabilityScore = scoreReliability(assessmentText);

      await onScoreSource({
        source_url: source.url,
        source_title: source.title,
        reliability_score: reliabilityScore,
        assessment: assessmentText.length > 300 ? assessmentText.slice(0, 297) + "..." : assessmentText,
      });
      sourcesScored++;
    } catch (err) {
      console.warn(
        `[Enrichment] Failed to score "${source.title}": ${getErrorMessage(err)}`
      );
    }
  }

  return { enriched_count: enrichedCount, sources_scored: sourcesScored };
}
