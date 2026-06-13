import { getErrorMessage } from "./utils/errors";
import { Client } from "@elastic/elasticsearch";
import { featherlessChatText } from "./apis/featherless";
import type {
  VocabularyEntry,
  ElasticDocument,
  LanguageStats,
  SourceType,
  GrammarPattern,
  GrammarCategory,
  LanguageEntry,
  LanguageFilters,
  LanguageBrowserStats,
  EndangermentStatus,
  PreservationStatus,
  SourceInfo,
  SignificantTerm,
  SignificantTermsResult,
  PipelineSourceOutcome,
} from "./types";

const INDEX_NAME = "language_resources";
const GRAMMAR_INDEX = "grammar_patterns";
const LANGUAGES_INDEX = "languages";
const SOURCE_OUTCOMES_INDEX = "source_outcomes";
const JINA_MODEL = "jina-embeddings-v3";
const EMBEDDING_DIMS = 1024;

// ---------------------------------------------------------------------------
// Elasticsearch client (singleton)
// ---------------------------------------------------------------------------

let _client: Client | null = null;

export function getClient(): Client {
  if (_client) return _client;

  const node = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;

  if (!node || !apiKey) {
    throw new Error(
      "Missing ELASTIC_URL or ELASTIC_API_KEY environment variables"
    );
  }

  _client = new Client({
    node,
    auth: { apiKey },
  });

  return _client;
}

// ---------------------------------------------------------------------------
// JINA Embeddings (with retry + exponential backoff)
// ---------------------------------------------------------------------------

type JinaTask = "retrieval.query" | "retrieval.passage" | "text-matching";

const JINA_MAX_RETRIES = 3;
const JINA_BASE_DELAY_MS = 1_000;

export async function getEmbeddings(
  texts: string[],
  task: JinaTask = "text-matching"
): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error("Missing JINA_API_KEY environment variable");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < JINA_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        input: texts,
        task,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data: { embedding: number[] }[];
      };
      return json.data.map((d) => d.embedding);
    }

    const body = await res.text().catch(() => "");
    lastError = new Error(`JINA API error ${res.status}: ${body}`);

    const isRetryable = res.status === 429 || res.status >= 500;
    if (isRetryable && attempt < JINA_MAX_RETRIES - 1) {
      const jitter = Math.random() * 500;
      const delay = JINA_BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
      console.warn(
        `[JINA] ${res.status} on attempt ${attempt + 1}/${JINA_MAX_RETRIES}, retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    break;
  }

  throw lastError!;
}

// ---------------------------------------------------------------------------
// JINA Reranker (second-pass cross-encoder scoring)
// ---------------------------------------------------------------------------

const JINA_RERANKER_MODEL = "jina-reranker-v2-base-multilingual";
const RERANK_WINDOW = 50;

async function rerank(
  query: string,
  documents: string[],
  topN: number
): Promise<{ index: number; relevance_score: number }[]> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) throw new Error("Missing JINA_API_KEY environment variable");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < JINA_MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.jina.ai/v1/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JINA_RERANKER_MODEL,
        query,
        documents,
        top_n: topN,
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        results: { index: number; relevance_score: number }[];
      };
      return json.results.sort((a, b) => b.relevance_score - a.relevance_score);
    }

    const body = await res.text().catch(() => "");
    lastError = new Error(`JINA Reranker error ${res.status}: ${body}`);

    const isRetryable = res.status === 429 || res.status >= 500;
    if (isRetryable && attempt < JINA_MAX_RETRIES - 1) {
      const jitter = Math.random() * 500;
      const delay = JINA_BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
      console.warn(
        `[JINA Reranker] ${res.status} on attempt ${attempt + 1}/${JINA_MAX_RETRIES}, retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    break;
  }

  throw lastError!;
}

// Build a single string that captures the full semantic content of an entry.
export function buildEmbeddingText(entry: VocabularyEntry): string {
  const parts: string[] = [
    entry.headword_native,
    ...(entry.headword_romanized ? [entry.headword_romanized] : []),
    ...entry.definitions.map((d) => d.text),
    ...entry.example_sentences.map(
      (s) => [s.target, s.contact, s.english].filter(Boolean).join(" ")
    ),
  ];
  if (entry.semantic_cluster) parts.push(entry.semantic_cluster);
  if (entry.ipa) parts.push(entry.ipa);
  if (entry.conjugations?.length) {
    parts.push(entry.conjugations.map((c) => `${c.form}: ${c.native}`).join(", "));
  }
  if (entry.grammar_notes) parts.push(entry.grammar_notes);
  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// Query expansion for cross-lingual search (Featherless)
// ---------------------------------------------------------------------------

function buildExpansionPrompt(languageName: string): string {
  return `You translate search queries for a ${languageName} endangered language dictionary. Given a query in any language, return equivalent terms in the target language, any known contact languages, English, plus romanized forms and the likely semantic domain.

Return ONLY a single line of space-separated terms, no explanation, no punctuation except hyphens within compound terms.`;
}

const EXPAND_CACHE_MAX = 200;
const expandCache = new Map<string, string>();

function expandCacheGet(key: string): string | undefined {
  const value = expandCache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used) by re-inserting
    expandCache.delete(key);
    expandCache.set(key, value);
  }
  return value;
}

function expandCacheSet(key: string, value: string): void {
  if (expandCache.size >= EXPAND_CACHE_MAX) {
    // Evict oldest (first inserted) entry
    const firstKey = expandCache.keys().next().value;
    if (firstKey !== undefined) expandCache.delete(firstKey);
  }
  expandCache.set(key, value);
}

async function expandQuery(query: string, languageName: string = "Unknown"): Promise<string> {
  const cacheKey = `${languageName}::${query}`;
  const cached = expandCacheGet(cacheKey);
  if (cached) return cached;

  try {
    const expanded = await featherlessChatText({
      system: buildExpansionPrompt(languageName),
      prompt: query,
      maxTokens: 150,
      temperature: 0,
    });
    const result = expanded ? `${query} ${expanded}` : query;

    expandCacheSet(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(
      "[elastic] Query expansion failed, using raw query:",
      getErrorMessage(err)
    );
    return query;
  }
}

// ---------------------------------------------------------------------------
// BM25 query builder (with proper nested field support)
// ---------------------------------------------------------------------------

function buildBM25Query(query: string): Record<string, unknown> {
  return {
    bool: {
      should: [
        // Top-level fields (multi_match works here)
        {
          multi_match: {
            query,
            fields: [
              "headword_native^3",
              "headword_native.text^2",
              "headword_native.partial^1.5",             // agglutinative prefix match
              "headword_romanized^3",
              "headword_romanized.text^2",
              "headword_romanized.normalized^2.5",       // diacritic-normalized romanization
              "ipa.searchable^1.5",                       // IPA phonemic search
              "cultural_context",
            ],
            type: "best_fields",
            fuzziness: "AUTO",
          },
        },
        // Exact normalized romanization match (high precision for diacritics)
        // "omoni" matches "ŏmŏni", "halmoni" matches "halmŏni"
        {
          match: {
            "headword_romanized.normalized": {
              query,
              boost: 3.5,
            },
          },
        },
        // Fuzzy romanization match (catches typos like "bading" → "badang")
        {
          fuzzy: {
            "headword_romanized.text": {
              value: query.toLowerCase(),
              fuzziness: 2,
              boost: 3,
            },
          },
        },
        // Nested: definitions (the primary cross-lingual bridge)
        {
          nested: {
            path: "definitions",
            query: {
              match: {
                "definitions.text": {
                  query,
                  boost: 2,
                },
              },
            },
          },
        },
        // Nested: example sentences
        {
          nested: {
            path: "example_sentences",
            query: {
              bool: {
                should: [
                  {
                    match: {
                      "example_sentences.target": { query, boost: 1.5 },
                    },
                  },
                  {
                    match: {
                      "example_sentences.contact": { query, boost: 1.5 },
                    },
                  },
                  {
                    match: {
                      "example_sentences.english": { query, boost: 1 },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Index a single entry
// ---------------------------------------------------------------------------

export async function indexEntry(entry: VocabularyEntry, language_code: string): Promise<void> {
  const client = getClient();
  const [embedding] = await getEmbeddings([buildEmbeddingText(entry)], "retrieval.passage");

  const doc: ElasticDocument = {
    ...entry,
    language_code,
    embedding,
    created_at: new Date().toISOString(),
  };

  await client.index({
    index: INDEX_NAME,
    id: doc.id,
    document: doc,
    refresh: "wait_for",
  });
}

// ---------------------------------------------------------------------------
// Merge-on-upsert script (Elasticsearch Painless)
// When a document already exists, merges array fields instead of overwriting.
// Deduplicates by: definitions (language::text), examples (jejueo),
// cross_references (source_url), related_terms (set union).
// ---------------------------------------------------------------------------

/* eslint-disable no-useless-escape */
const MERGE_UPSERT_SCRIPT = `
  // Merge definitions — deduplicate by language+text
  def existingDefs = ctx._source.definitions ?: [];
  def incomingDefs = params.incoming.definitions ?: [];
  def defKeys = new HashSet();
  for (def d : existingDefs) { defKeys.add(d.language + '::' + d.text); }
  for (def d : incomingDefs) {
    def key = d.language + '::' + d.text;
    if (!defKeys.contains(key)) { existingDefs.add(d); defKeys.add(key); }
  }
  ctx._source.definitions = existingDefs;

  // Merge example_sentences — deduplicate by target text (backward-compat: also check old 'jejueo' field)
  def existingEx = ctx._source.example_sentences ?: [];
  def incomingEx = params.incoming.example_sentences ?: [];
  def exKeys = new HashSet();
  for (def e : existingEx) {
    def key = e.containsKey('target') ? e.target : (e.containsKey('jejueo') ? e.jejueo : '');
    exKeys.add(key);
  }
  for (def e : incomingEx) {
    def key = e.containsKey('target') ? e.target : (e.containsKey('jejueo') ? e.jejueo : '');
    if (!exKeys.contains(key)) { existingEx.add(e); exKeys.add(key); }
  }
  ctx._source.example_sentences = existingEx;

  // Merge cross_references — deduplicate by source_url
  def existingCR = ctx._source.cross_references ?: [];
  def incomingCR = params.incoming.cross_references ?: [];
  def crUrls = new HashSet();
  for (def cr : existingCR) { crUrls.add(cr.source_url); }
  for (def cr : incomingCR) {
    if (!crUrls.contains(cr.source_url)) { existingCR.add(cr); crUrls.add(cr.source_url); }
  }
  ctx._source.cross_references = existingCR;

  // Merge related_terms — union
  def existingRT = ctx._source.related_terms ?: [];
  def incomingRT = params.incoming.related_terms ?: [];
  def rtSet = new HashSet(existingRT);
  for (def t : incomingRT) { rtSet.add(t); }
  ctx._source.related_terms = new ArrayList(rtSet);

  // Merge conjugations — deduplicate by form
  def existingConj = ctx._source.conjugations ?: [];
  def incomingConj = params.incoming.conjugations ?: [];
  def conjKeys = new HashSet();
  for (def c : existingConj) { conjKeys.add(c.form); }
  for (def c : incomingConj) {
    if (!conjKeys.contains(c.form)) { existingConj.add(c); conjKeys.add(c.form); }
  }
  if (existingConj.size() > 0) { ctx._source.conjugations = existingConj; }

  // Update scalar fields (prefer incoming if non-empty)
  if (params.incoming.headword_romanized != null && params.incoming.headword_romanized != '') {
    ctx._source.headword_romanized = params.incoming.headword_romanized;
  }
  if (params.incoming.semantic_cluster != null) {
    ctx._source.semantic_cluster = params.incoming.semantic_cluster;
  }
  if (params.incoming.audio_url != null && params.incoming.audio_url != '') {
    ctx._source.audio_url = params.incoming.audio_url;
  }
  if (params.incoming.cultural_context != null) {
    ctx._source.cultural_context = params.incoming.cultural_context;
  }
  if (params.incoming.ipa != null && params.incoming.ipa != '') {
    ctx._source.ipa = params.incoming.ipa;
  }
  if (params.incoming.morphology != null) {
    ctx._source.morphology = params.incoming.morphology;
  }
  if (params.incoming.usage != null) {
    ctx._source.usage = params.incoming.usage;
  }
  if (params.incoming.grammar_notes != null && params.incoming.grammar_notes != '') {
    ctx._source.grammar_notes = params.incoming.grammar_notes;
  }
  if (params.incoming.language_code != null && params.incoming.language_code != '') {
    ctx._source.language_code = params.incoming.language_code;
  }
  if (params.incoming.glottocode != null && params.incoming.glottocode != '') {
    ctx._source.glottocode = params.incoming.glottocode;
  }
  if (params.incoming.language_name != null && params.incoming.language_name != '') {
    ctx._source.language_name = params.incoming.language_name;
  }

  // ── Quality signals ──────────────────────────────────────────────

  // language_confidence: promote only (low < medium < high, never demote)
  def confRank = ['low': 1, 'medium': 2, 'high': 3];
  def existingConf = ctx._source.containsKey('language_confidence') ? ctx._source.language_confidence : null;
  def incomingConf = params.incoming.containsKey('language_confidence') ? params.incoming.language_confidence : null;
  if (incomingConf != null) {
    if (existingConf == null) {
      ctx._source.language_confidence = incomingConf;
    } else {
      def existingRank = confRank.containsKey(existingConf) ? confRank.get(existingConf) : 0;
      def incomingRank = confRank.containsKey(incomingConf) ? confRank.get(incomingConf) : 0;
      if (incomingRank > existingRank) {
        ctx._source.language_confidence = incomingConf;
      }
    }
  }

  // source_count: recompute from cross_references after merge
  def crForCount = ctx._source.cross_references ?: [];
  ctx._source.source_count = crForCount.size();

  // reliability_score: backfill from incoming cross_references to existing ones
  def mergedCRList = ctx._source.cross_references ?: [];
  def incomingCRList = params.incoming.cross_references ?: [];
  def scoreMap = new HashMap();
  for (def cr : incomingCRList) {
    if (cr.containsKey('reliability_score') && cr.reliability_score != null) {
      scoreMap.put(cr.source_url, cr.reliability_score);
    }
  }
  if (scoreMap.size() > 0) {
    for (def cr : mergedCRList) {
      if (scoreMap.containsKey(cr.source_url)) {
        def newScore = scoreMap.get(cr.source_url);
        def oldScore = cr.containsKey('reliability_score') ? cr.reliability_score : null;
        if (oldScore == null || newScore > oldScore) {
          cr.reliability_score = newScore;
        }
      }
    }
  }

  ctx._source.created_at = params.incoming.created_at;
`;
/* eslint-enable no-useless-escape */

// ---------------------------------------------------------------------------
// Bulk index entries
// ---------------------------------------------------------------------------

export async function bulkIndex(
  entries: VocabularyEntry[],
  language_code: string,
  glottocode?: string,
  language_name?: string
): Promise<{ indexed: number }> {
  if (entries.length === 0) return { indexed: 0 };

  // Filter out entries with empty headwords (defense-in-depth)
  const validEntries = entries.filter((e) => e.headword_native?.trim());
  if (validEntries.length < entries.length) {
    console.warn(
      `[elastic] Filtered ${entries.length - validEntries.length} entries with empty headword_native`
    );
  }
  if (validEntries.length === 0) return { indexed: 0 };

  const client = getClient();

  // Phase 1: Scripted upsert — merges array fields on update, inserts on create
  // `upsert` handles first-insert; `script` handles merge on existing docs
  const operations = validEntries.flatMap((entry) => {
    const doc: Record<string, unknown> = {
      ...entry,
      language_code,
      created_at: new Date().toISOString(),
    };
    if (glottocode) doc.glottocode = glottocode;
    if (language_name) doc.language_name = language_name;
    return [
      { update: { _index: INDEX_NAME, _id: entry.id } },
      {
        script: {
          source: MERGE_UPSERT_SCRIPT,
          params: { incoming: doc },
        },
        upsert: doc,
      },
    ];
  });

  const response = await client.bulk({
    refresh: "wait_for",
    operations,
  });

  if (response.errors) {
    const failed = response.items.filter(
      (item) => item.update?.error
    );
    console.error(
      `[elastic] Bulk upsert errors: ${failed.length}/${validEntries.length} failed`
    );
    for (const item of failed.slice(0, 5)) {
      console.error(`  - ${item.update?._id}: ${JSON.stringify(item.update?.error)}`);
    }
  }

  const indexed = response.items.filter(
    (item) => !item.update?.error
  ).length;

  // Phase 2: Backfill embeddings asynchronously (fire-and-forget)
  backfillEmbeddings(validEntries).catch((err) =>
    console.error(`[elastic] Embedding backfill error: ${getErrorMessage(err)}`)
  );

  return { indexed };
}

// ---------------------------------------------------------------------------
// Async embedding backfill
// ---------------------------------------------------------------------------

export async function backfillEmbeddings(
  entries: VocabularyEntry[],
  onProgress?: (message: string) => void
): Promise<void> {
  if (entries.length === 0) return;

  const client = getClient();
  const EMB_BATCH_SIZE = 256;

  onProgress?.(`Generating embeddings for ${entries.length} entries...`);

  for (let i = 0; i < entries.length; i += EMB_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMB_BATCH_SIZE);
    const texts = batch.map(buildEmbeddingText);

    try {
      const embeddings = await getEmbeddings(texts, "retrieval.passage");

      const updateOps = batch.flatMap((entry, idx) => [
        { update: { _index: INDEX_NAME, _id: entry.id } },
        { doc: { embedding: embeddings[idx] } },
      ]);

      await client.bulk({ refresh: false, operations: updateOps });
      onProgress?.(`Embedded ${Math.min(i + EMB_BATCH_SIZE, entries.length)}/${entries.length} entries`);
    } catch (err) {
      console.error(
        `[elastic] Embedding backfill failed for batch at offset ${i}: ${getErrorMessage(err)}`
      );
    }
  }

  onProgress?.(`Embedding backfill complete for ${entries.length} entries.`);
}

// ---------------------------------------------------------------------------
// Hybrid search (BM25 + kNN with RRF)
// ---------------------------------------------------------------------------

export async function search(
  query: string,
  options: { limit?: number; offset?: number; language_code?: string; language_name?: string } = {}
): Promise<{ entries: VocabularyEntry[]; total: number }> {
  const { limit = 10, offset = 0, language_code, language_name } = options;
  const client = getClient();
  const isFirstPage = offset === 0;

  // Step 1: Expand query for cross-lingual matching
  const expandedQuery = await expandQuery(query, language_name);

  // Step 2: Embed the expanded query (richer semantic vector)
  const [queryVector] = await getEmbeddings([expandedQuery], "retrieval.query");

  // Step 3: Hybrid search with BM25 + kNN via RRF
  // On first page, overfetch for reranking; on subsequent pages, fetch normally
  const esSize = isFirstPage ? Math.max(limit, RERANK_WINDOW) : limit;
  const fetchSize = isFirstPage ? esSize : offset + limit;

  // Optional language_code filter applied to both retrievers
  const langFilter = language_code ? [{ term: { language_code } }] : undefined;
  const bm25Query = language_code
    ? { bool: { must: buildBM25Query(query), filter: langFilter } }
    : buildBM25Query(query);

  const response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    size: esSize,
    from: isFirstPage ? 0 : offset,
    retriever: {
      rrf: {
        retrievers: [
          // BM25 text retriever (uses RAW query for precise lexical matching)
          {
            standard: {
              query: bm25Query,
            },
          },
          // kNN vector retriever (uses EXPANDED query for cross-lingual recall)
          {
            knn: {
              field: "embedding",
              query_vector: queryVector,
              k: fetchSize,
              num_candidates: Math.max(fetchSize * 10, 100),
              ...(langFilter ? { filter: langFilter } : {}),
            },
          },
        ],
        rank_window_size: Math.max(fetchSize, 50),
        rank_constant: 20,
      },
    },
    _source: {
      excludes: ["embedding"],
    },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  let entries: VocabularyEntry[] = response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is ElasticDocument => src !== undefined);

  // Step 4: Rerank — cross-encoder second-pass scoring (first page only)
  if (isFirstPage && entries.length > 1) {
    try {
      const docTexts = entries.map(buildEmbeddingText);
      const ranked = await rerank(query, docTexts, limit);
      entries = ranked.map((r) => entries[r.index]);
    } catch (err) {
      // Graceful fallback: use RRF order if reranker fails
      console.warn(`[search] Reranker failed, falling back to RRF order: ${getErrorMessage(err)}`);
      entries = entries.slice(0, limit);
    }
  }

  // Step 5: Cluster expansion — only on the first page to fill remaining slots
  if (isFirstPage && entries.length > 0 && entries.length < limit) {
    const clusters = [
      ...new Set(
        entries
          .map((r) => r.semantic_cluster)
          .filter((c): c is string => Boolean(c))
      ),
    ];

    if (clusters.length > 0) {
      const existingIds = new Set(entries.map((r) => r.id));
      const remaining = limit - entries.length;

      const clusterResponse = await client.search<ElasticDocument>({
        index: INDEX_NAME,
        size: remaining,
        query: {
          bool: {
            must: [{ terms: { semantic_cluster: clusters } }],
            must_not: [{ ids: { values: [...existingIds] } }],
            ...(language_code ? { filter: [{ term: { language_code } }] } : {}),
          },
        },
        _source: {
          excludes: ["embedding"],
        },
      });

      const clusterResults = clusterResponse.hits.hits
        .map((hit) => hit._source)
        .filter((src): src is ElasticDocument => src !== undefined);

      return { entries: [...entries, ...clusterResults], total };
    }
  }

  return { entries, total };
}

// ---------------------------------------------------------------------------
// Headword-only search (lightweight — no query expansion, no embeddings)
// Used by cross-reference agent for duplicate detection.
// ---------------------------------------------------------------------------

export async function searchByHeadword(
  query: string,
  options: { language_code?: string; limit?: number } = {}
): Promise<{ entries: VocabularyEntry[]; total: number }> {
  const { language_code, limit = 10 } = options;
  const client = getClient();

  const shouldClauses = [
    // Exact keyword match on native headword (highest priority)
    { term: { headword_native: { value: query, boost: 5 } } },
    // Exact keyword match on romanized headword
    { term: { headword_romanized: { value: query, boost: 5 } } },
    // Fuzzy text match on native (catches analyzer variants)
    { match: { "headword_native.text": { query, boost: 2 } } },
    // Partial prefix match on native (agglutinative morpheme matching)
    { match: { "headword_native.partial": { query, boost: 1.5 } } },
    // Fuzzy text match on romanized (catches typos, transliteration diffs)
    { match: { "headword_romanized.text": { query, fuzziness: "AUTO", boost: 2 } } },
    // Diacritic-normalized romanization match (ŏ→o, ə→a, etc.)
    { match: { "headword_romanized.normalized": { query, boost: 3 } } },
  ];

  const boolQuery: Record<string, unknown> = {
    should: shouldClauses,
    minimum_should_match: 1,
    ...(language_code ? { filter: [{ term: { language_code } }] } : {}),
  };

  const response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    size: limit,
    query: { bool: boolQuery },
    _source: { excludes: ["embedding"] },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const entries = response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is ElasticDocument => src !== undefined);

  return { entries, total };
}

// ---------------------------------------------------------------------------
// Browse entries (no search query — paginated, sorted by recency)
// ---------------------------------------------------------------------------

export async function browse(
  options: { limit?: number; offset?: number; cluster?: string; language_code?: string } = {}
): Promise<{ entries: VocabularyEntry[]; total: number }> {
  const { limit = 20, offset = 0, cluster, language_code } = options;
  const client = getClient();

  const mustClause =
    cluster && cluster !== "all"
      ? { term: { semantic_cluster: cluster } }
      : { match_all: {} };

  const filter: Record<string, unknown>[] = [];
  if (language_code) {
    filter.push({ term: { language_code } });
  }

  const response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    size: limit,
    from: offset,
    query: {
      bool: {
        must: mustClause,
        must_not: { term: { "headword_native.keyword": "" } },
        ...(filter.length > 0 ? { filter } : {}),
      },
    },
    sort: [{ created_at: "desc" }],
    _source: { excludes: ["embedding"] },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const entries = response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is ElasticDocument => src !== undefined);

  return { entries, total };
}

// ---------------------------------------------------------------------------
// Get aggregate stats
// ---------------------------------------------------------------------------

export async function getStats(language_code?: string): Promise<LanguageStats> {
  const client = getClient();

  const baseQuery = language_code
    ? { bool: { filter: [{ term: { language_code } }] } }
    : undefined;

  // Query both indices in parallel
  const [vocabResponse, grammarCountResponse] = await Promise.all([
    client.search({
      index: INDEX_NAME,
      size: 0,
      ...(baseQuery && { query: baseQuery }),
      aggs: {
        total_entries: { value_count: { field: "headword_native" } },
        unique_sources: {
          cardinality: {
            field: "cross_references.source_url",
          },
        },
        has_audio: {
          filter: { exists: { field: "audio_url" } },
        },
        source_types: {
          nested: { path: "cross_references" },
          aggs: {
            types: {
              terms: { field: "cross_references.source_type", size: 10 },
            },
          },
        },
      },
    }),
    client.count({
      index: GRAMMAR_INDEX,
      ...(baseQuery && { query: baseQuery }),
    }).catch(() => ({ count: 0 })),
  ]);

  const aggs = vocabResponse.aggregations as Record<string, any>;

  const sourceTypeBuckets: { key: string; doc_count: number }[] =
    aggs?.source_types?.types?.buckets ?? [];

  const sourcesByType: Record<SourceType, number> = {
    dictionary: 0,
    academic: 0,
    video: 0,
    archive: 0,
    wiki: 0,
  };

  let totalSourceCount = 0;
  for (const bucket of sourceTypeBuckets) {
    const key = bucket.key as SourceType;
    if (key in sourcesByType) {
      sourcesByType[key] = bucket.doc_count;
    }
    totalSourceCount += bucket.doc_count;
  }

  const totalEntries = (aggs?.total_entries?.value as number) ?? 0;
  // Default estimate; overridden per-language in the server orchestrator
  const ESTIMATED_TOTAL_VOCAB = 20_000;

  return {
    total_entries: totalEntries,
    total_sources: totalSourceCount,
    total_audio_clips: (aggs?.has_audio?.doc_count as number) ?? 0,
    grammar_patterns: grammarCountResponse.count,
    coverage_percentage:
      Math.round((totalEntries / ESTIMATED_TOTAL_VOCAB) * 1000) / 10,
    sources_by_type: sourcesByType,
  };
}

// ---------------------------------------------------------------------------
// Get vocabulary entries from a specific source
// ---------------------------------------------------------------------------

export async function getEntriesBySource(
  sourceUrl: string,
  options: { language_code?: string; limit?: number } = {}
): Promise<{ entries: VocabularyEntry[]; total: number }> {
  const { language_code, limit = 50 } = options;
  const client = getClient();

  const filter: Record<string, unknown>[] = [
    {
      nested: {
        path: "cross_references",
        query: { term: { "cross_references.source_url": sourceUrl } },
      },
    },
  ];
  if (language_code) {
    filter.push({ term: { language_code } });
  }

  const response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    size: limit,
    query: { bool: { filter } },
    sort: [{ created_at: "desc" }],
    _source: { excludes: ["embedding"] },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const entries = response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is ElasticDocument => src !== undefined);

  return { entries, total };
}

// ---------------------------------------------------------------------------
// Significant terms — auto-discover statistically unusual vocabulary patterns
// ---------------------------------------------------------------------------

export async function getSignificantTerms(
  options: {
    language_code?: string;
    source_url?: string;
    cluster?: string;
    size?: number;
  } = {}
): Promise<SignificantTermsResult> {
  const client = getClient();
  const { size = 10 } = options;

  // Build foreground query (the subset to compare against the background)
  const must: Record<string, unknown>[] = [];

  if (options.language_code) {
    must.push({ term: { language_code: options.language_code } });
  }
  if (options.source_url) {
    must.push({
      nested: {
        path: "cross_references",
        query: { term: { "cross_references.source_url": options.source_url } },
      },
    });
  }
  if (options.cluster) {
    must.push({ term: { semantic_cluster: options.cluster } });
  }

  // significant_terms needs a foreground subset to compare against background
  if (must.length === 0) {
    return { clusters: [], pos: [], terms: [] };
  }

  const response = await client.search({
    index: INDEX_NAME,
    size: 0,
    query: { bool: { must } },
    aggs: {
      sig_clusters: {
        significant_terms: {
          field: "semantic_cluster",
          size,
          min_doc_count: 2,
        },
      },
      sig_pos: {
        significant_terms: {
          field: "pos",
          size,
          min_doc_count: 2,
        },
      },
      sig_terms: {
        significant_terms: {
          field: "related_terms",
          size,
          min_doc_count: 2,
        },
      },
    },
  });

  const aggs = response.aggregations as Record<string, unknown>;

  function extractBuckets(aggName: string): SignificantTerm[] {
    const agg = aggs?.[aggName] as { buckets?: unknown[] } | undefined;
    const buckets = agg?.buckets ?? [];
    return buckets.map((b: unknown) => {
      const bucket = b as { key: string; doc_count: number; score: number; bg_count: number };
      return {
        key: bucket.key,
        doc_count: bucket.doc_count,
        score: bucket.score,
        bg_count: bucket.bg_count,
      };
    });
  }

  return {
    clusters: extractBuckets("sig_clusters"),
    pos: extractBuckets("sig_pos"),
    terms: extractBuckets("sig_terms"),
  };
}

// ---------------------------------------------------------------------------
// Get previously processed source URLs (for deduplication across pipeline runs)
// ---------------------------------------------------------------------------

export async function getProcessedSourceUrls(language_code?: string): Promise<Map<string, number>> {
  const client = getClient();

  const baseQuery = language_code
    ? { bool: { filter: [{ term: { language_code } }] } }
    : undefined;

  const response = await client.search({
    index: INDEX_NAME,
    size: 0,
    ...(baseQuery && { query: baseQuery }),
    aggs: {
      sources: {
        nested: { path: "cross_references" },
        aggs: {
          urls: {
            terms: {
              field: "cross_references.source_url",
              size: 10_000,
            },
          },
        },
      },
    },
  });

  const aggs = response.aggregations as Record<string, any>;
  const buckets: { key: string; doc_count: number }[] =
    aggs?.sources?.urls?.buckets ?? [];

  const result = new Map<string, number>();
  for (const bucket of buckets) {
    result.set(bucket.key, bucket.doc_count);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Get unique sources with metadata and entry counts
// ---------------------------------------------------------------------------

export async function getSources(language_code?: string): Promise<SourceInfo[]> {
  const client = getClient();

  // Try source_outcomes index first (populated after pipeline runs)
  try {
    const query = language_code
      ? { term: { language_code } }
      : { match_all: {} };

    const response = await client.search<Record<string, unknown>>({
      index: SOURCE_OUTCOMES_INDEX,
      size: 500,
      query,
      sort: [
        { entry_count: "desc" as const },
        { grammar_count: "desc" as const },
      ],
    });

    if (response.hits.hits.length > 0) {
      return response.hits.hits
        .map((hit) => hit._source)
        .filter((src): src is Record<string, unknown> => src !== undefined)
        .map((doc) => ({
          url: String(doc.url ?? ""),
          title: String(doc.title ?? ""),
          type: (doc.type as SourceType) || "archive",
          entry_count: Number(doc.entry_count ?? 0),
          grammar_count: Number(doc.grammar_count ?? 0),
          status: doc.status as SourceInfo["status"],
          error: doc.error ? String(doc.error) : undefined,
        }));
    }
  } catch {
    // Index may not exist yet — fall through to legacy aggregation
  }

  // Fallback: legacy aggregation from cross_references (for pre-existing data)
  const baseQuery = language_code
    ? { bool: { filter: [{ term: { language_code } }] } }
    : undefined;

  const response = await client.search({
    index: INDEX_NAME,
    size: 0,
    ...(baseQuery && { query: baseQuery }),
    aggs: {
      sources: {
        nested: { path: "cross_references" },
        aggs: {
          by_url: {
            terms: {
              field: "cross_references.source_url",
              size: 500,
              order: { _count: "desc" },
            },
            aggs: {
              title: {
                terms: {
                  field: "cross_references.source_title.keyword",
                  size: 1,
                },
              },
              type: {
                terms: {
                  field: "cross_references.source_type",
                  size: 1,
                },
              },
            },
          },
        },
      },
    },
  });

  const aggs = response.aggregations as Record<string, any>;
  const buckets: any[] = aggs?.sources?.by_url?.buckets ?? [];

  return buckets.map((bucket) => ({
    url: bucket.key as string,
    title:
      (bucket.title?.buckets?.[0]?.key as string) ??
      new URL(bucket.key).hostname,
    type: (bucket.type?.buckets?.[0]?.key as SourceType) ?? "other",
    entry_count: bucket.doc_count as number,
    grammar_count: 0,
  }));
}

// ---------------------------------------------------------------------------
// Find similar entries by headword/embedding
// ---------------------------------------------------------------------------

export async function findSimilar(
  headword: string,
  limit: number = 5,
  language_code?: string
): Promise<VocabularyEntry[]> {
  const client = getClient();
  const [queryVector] = await getEmbeddings([headword], "retrieval.query");

  const langFilter = language_code ? [{ term: { language_code } }] : undefined;

  const response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    size: limit + 1, // fetch extra in case we need to exclude exact match
    knn: {
      field: "embedding",
      query_vector: queryVector,
      k: limit + 1,
      num_candidates: Math.max((limit + 1) * 10, 100),
      ...(langFilter ? { filter: langFilter } : {}),
    },
    _source: {
      excludes: ["embedding"],
    },
  });

  return response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is ElasticDocument => src !== undefined)
    .filter((entry) => entry.headword_native !== headword)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Bulk-update audio_url on entries from a given source
// ---------------------------------------------------------------------------

export async function bulkUpdateAudioUrl(
  sourceUrl: string,
  audioUrl: string
): Promise<{ updated: number }> {
  const client = getClient();

  const response = await client.updateByQuery({
    index: INDEX_NAME,
    query: {
      nested: {
        path: "cross_references",
        query: { term: { "cross_references.source_url": sourceUrl } },
      },
    },
    script: {
      source: "if (ctx._source.audio_url == null || ctx._source.audio_url == '') { ctx._source.audio_url = params.audio_url; }",
      params: { audio_url: audioUrl },
    },
    refresh: true,
  });

  return { updated: response.updated ?? 0 };
}

// ---------------------------------------------------------------------------
// Match word-level audio clips to individual entries by headword
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export async function matchWordClipsToEntries(
  sourceUrl: string,
  wordClips: Record<string, string>
): Promise<{ matched: number }> {
  const client = getClient();

  // Fetch entries from this source that lack audio_url
  const response = await client.search({
    index: INDEX_NAME,
    size: 200,
    query: {
      bool: {
        must: [
          { nested: { path: "cross_references", query: { term: { "cross_references.source_url": sourceUrl } } } },
        ],
        should: [
          { bool: { must_not: [{ exists: { field: "audio_url" } }] } },
          { term: { "audio_url.keyword": "" } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["headword_native", "headword_romanized"],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits = response.hits.hits as { _id: string; _source: any }[];
  if (hits.length === 0) return { matched: 0 };

  // Build normalized lookup for word clips
  const normalizedClips = new Map<string, string>();
  for (const [word, url] of Object.entries(wordClips)) {
    normalizedClips.set(word.trim().normalize("NFC").toLowerCase(), url);
  }
  const clipWords = [...normalizedClips.keys()];

  // Match each entry headword to the best word clip
  const updates: { id: string; audioUrl: string }[] = [];

  for (const hit of hits) {
    const native = (hit._source.headword_native || "").trim().normalize("NFC");
    const romanized = (hit._source.headword_romanized || "").trim().normalize("NFC");

    let matchedUrl: string | undefined;

    // 1. Exact match (case-insensitive)
    const nativeLower = native.toLowerCase();
    if (normalizedClips.has(nativeLower)) {
      matchedUrl = normalizedClips.get(nativeLower);
    }

    // 2. Romanized exact match
    if (!matchedUrl && romanized) {
      const romanizedLower = romanized.toLowerCase();
      if (normalizedClips.has(romanizedLower)) {
        matchedUrl = normalizedClips.get(romanizedLower);
      }
    }

    // 3. Fuzzy match on native headword (edit distance threshold by length)
    if (!matchedUrl && native.length > 1) {
      const maxDist = native.length <= 3 ? 1 : native.length <= 6 ? 2 : 3;
      let bestDist = maxDist + 1;
      for (const clipWord of clipWords) {
        // Skip if lengths are too different
        if (Math.abs(clipWord.length - nativeLower.length) > maxDist) continue;
        const dist = levenshtein(nativeLower, clipWord);
        if (dist <= maxDist && dist < bestDist) {
          bestDist = dist;
          matchedUrl = normalizedClips.get(clipWord);
        }
      }
    }

    if (matchedUrl) {
      updates.push({ id: hit._id, audioUrl: matchedUrl });
    }
  }

  // Bulk update matched entries
  if (updates.length > 0) {
    const body = updates.flatMap(({ id, audioUrl }) => [
      { update: { _index: INDEX_NAME, _id: id } },
      { doc: { audio_url: audioUrl } },
    ]);
    await client.bulk({ body, refresh: true });
  }

  return { matched: updates.length };
}

// ---------------------------------------------------------------------------
// Scroll through all entries (for export)
// ---------------------------------------------------------------------------

export async function scrollAll(language_code?: string): Promise<VocabularyEntry[]> {
  const client = getClient();
  const entries: VocabularyEntry[] = [];

  const filter: Record<string, unknown>[] = [];
  if (language_code) {
    filter.push({ term: { language_code } });
  }

  let response = await client.search<ElasticDocument>({
    index: INDEX_NAME,
    scroll: "1m",
    size: 1000,
    query: {
      bool: {
        must: { match_all: {} },
        must_not: { term: { "headword_native.keyword": "" } },
        ...(filter.length > 0 ? { filter } : {}),
      },
    },
    _source: { excludes: ["embedding"] },
    sort: [{ created_at: "desc" }],
  });

  while (response.hits.hits.length > 0) {
    for (const hit of response.hits.hits) {
      if (hit._source) entries.push(hit._source);
    }

    if (!response._scroll_id) break;

    response = await client.scroll<ElasticDocument>({
      scroll_id: response._scroll_id,
      scroll: "1m",
    });
  }

  // Clear scroll context
  if (response._scroll_id) {
    await client.clearScroll({ scroll_id: response._scroll_id }).catch(() => {});
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Grammar patterns — bulk index (merge-on-upsert)
// ---------------------------------------------------------------------------

const GRAMMAR_MERGE_SCRIPT = `
  // Merge examples — deduplicate by target text (backward-compat: also check old 'jejueo' field)
  def existingEx = ctx._source.examples ?: [];
  def incomingEx = params.incoming.examples ?: [];
  def exKeys = new HashSet();
  for (def e : existingEx) {
    def key = e.containsKey('target') ? e.target : (e.containsKey('jejueo') ? e.jejueo : '');
    exKeys.add(key);
  }
  for (def e : incomingEx) {
    def key = e.containsKey('target') ? e.target : (e.containsKey('jejueo') ? e.jejueo : '');
    if (!exKeys.contains(key)) { existingEx.add(e); exKeys.add(key); }
  }
  ctx._source.examples = existingEx;

  // Merge related_vocabulary — union
  def existingRV = ctx._source.related_vocabulary ?: [];
  def incomingRV = params.incoming.related_vocabulary ?: [];
  def rvSet = new HashSet(existingRV);
  for (def v : incomingRV) { rvSet.add(v); }
  ctx._source.related_vocabulary = new ArrayList(rvSet);

  // Merge source_urls — union
  def existingURLs = ctx._source.source_urls ?: [];
  def incomingURLs = params.incoming.source_urls ?: [];
  def urlSet = new HashSet(existingURLs);
  for (def u : incomingURLs) { urlSet.add(u); }
  ctx._source.source_urls = new ArrayList(urlSet);

  // Update scalar fields (prefer incoming if non-empty)
  if (params.incoming.description != null && params.incoming.description != '') {
    ctx._source.description = params.incoming.description;
  }
  if (params.incoming.rule != null && params.incoming.rule != '') {
    ctx._source.rule = params.incoming.rule;
  }
  if (params.incoming.differences_from_contact != null) {
    ctx._source.differences_from_contact = params.incoming.differences_from_contact;
  }
  ctx._source.created_at = params.incoming.created_at;
`;

export async function bulkIndexGrammarPatterns(
  patterns: GrammarPattern[],
  language_code: string
): Promise<{ indexed: number }> {
  if (patterns.length === 0) return { indexed: 0 };

  const client = getClient();

  const operations = patterns.flatMap((pattern) => {
    const doc = {
      ...pattern,
      language_code,
      created_at: pattern.created_at || new Date().toISOString(),
    };
    return [
      { update: { _index: GRAMMAR_INDEX, _id: pattern.id } },
      {
        script: {
          source: GRAMMAR_MERGE_SCRIPT,
          params: { incoming: doc },
        },
        upsert: doc,
      },
    ];
  });

  const response = await client.bulk({
    refresh: "wait_for",
    operations,
  });

  if (response.errors) {
    const failed = response.items.filter((item) => item.update?.error);
    console.error(
      `[elastic] Grammar bulk upsert errors: ${failed.length}/${patterns.length} failed`
    );
    for (const item of failed.slice(0, 5)) {
      console.error(`  - ${item.update?._id}: ${JSON.stringify(item.update?.error)}`);
    }
  }

  return {
    indexed: response.items.filter((item) => !item.update?.error).length,
  };
}

// ---------------------------------------------------------------------------
// Source outcomes — bulk index
// ---------------------------------------------------------------------------

export async function bulkIndexSourceOutcomes(
  outcomes: PipelineSourceOutcome[],
  language_code: string
): Promise<{ indexed: number }> {
  if (outcomes.length === 0) return { indexed: 0 };

  const client = getClient();
  const { createHash } = await import("crypto");

  const operations = outcomes.flatMap((outcome) => {
    const id = createHash("sha256")
      .update(`${language_code}::${outcome.url}`)
      .digest("hex")
      .slice(0, 16);

    return [
      { index: { _index: SOURCE_OUTCOMES_INDEX, _id: `so-${id}` } },
      {
        url: outcome.url,
        title: outcome.title,
        type: outcome.type,
        language_code,
        status: outcome.status,
        entry_count: outcome.entry_count ?? 0,
        grammar_count: outcome.grammar_count ?? 0,
        audio_count: outcome.audio_count ?? 0,
        error: outcome.error ?? null,
        pipeline_run_at: new Date().toISOString(),
      },
    ];
  });

  const response = await client.bulk({
    refresh: "wait_for",
    operations,
  });

  if (response.errors) {
    const failed = response.items.filter((item) => item.index?.error);
    console.error(
      `[elastic] Source outcomes bulk index errors: ${failed.length}/${outcomes.length} failed`
    );
  }

  return {
    indexed: response.items.filter((item) => !item.index?.error).length,
  };
}

// ---------------------------------------------------------------------------
// Grammar patterns — search
// ---------------------------------------------------------------------------

export async function searchGrammarPatterns(
  query: string,
  options: { limit?: number; offset?: number; category?: GrammarCategory; language_code?: string } = {}
): Promise<{ patterns: GrammarPattern[]; total: number }> {
  const { limit = 20, offset = 0, category, language_code } = options;
  const client = getClient();

  const must: Record<string, unknown>[] = [];

  if (query) {
    must.push({
      bool: {
        should: [
          {
            multi_match: {
              query,
              fields: [
                "title^3",
                "title_native.text^2",
                "title_native.partial^1.5",
                "description^2",
                "rule",
                "differences_from_contact",
              ],
              type: "best_fields",
              fuzziness: "AUTO",
            },
          },
          {
            nested: {
              path: "examples",
              query: {
                bool: {
                  should: [
                    { match: { "examples.target": { query, boost: 1.5 } } },
                    { match: { "examples.contact": { query, boost: 1.5 } } },
                    { match: { "examples.english": { query, boost: 1 } } },
                  ],
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (category) {
    must.push({ term: { category } });
  }

  if (language_code) {
    must.push({ term: { language_code } });
  }

  const response = await client.search<GrammarPattern>({
    index: GRAMMAR_INDEX,
    size: limit,
    from: offset,
    query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    sort: [{ created_at: "desc" }],
    _source: { excludes: ["embedding"] },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const patterns = response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is GrammarPattern => src !== undefined);

  return { patterns, total };
}

// ---------------------------------------------------------------------------
// Grammar patterns — browse by category
// ---------------------------------------------------------------------------

export async function browseGrammarPatterns(
  options: { limit?: number; offset?: number; category?: GrammarCategory; language_code?: string } = {}
): Promise<{ patterns: GrammarPattern[]; total: number }> {
  return searchGrammarPatterns("", options);
}

// ---------------------------------------------------------------------------
// Grammar patterns — stats by category
// ---------------------------------------------------------------------------

export async function getGrammarStats(language_code?: string): Promise<{
  total: number;
  by_category: Record<string, number>;
}> {
  const client = getClient();

  const baseQuery = language_code
    ? { bool: { filter: [{ term: { language_code } }] } }
    : undefined;

  const response = await client.search({
    index: GRAMMAR_INDEX,
    size: 0,
    ...(baseQuery && { query: baseQuery }),
    aggs: {
      categories: {
        terms: { field: "category", size: 20 },
      },
    },
  });

  const aggs = response.aggregations as Record<string, any>;
  const buckets: { key: string; doc_count: number }[] =
    aggs?.categories?.buckets ?? [];

  const by_category: Record<string, number> = {};
  let total = 0;
  for (const bucket of buckets) {
    by_category[bucket.key] = bucket.doc_count;
    total += bucket.doc_count;
  }

  return { total, by_category };
}

// ---------------------------------------------------------------------------
// Languages index — search with filters
// ---------------------------------------------------------------------------

const SORT_MAP: Record<string, Record<string, unknown>> = {
  name_asc: { "name.keyword": { order: "asc" } },
  name_desc: { "name.keyword": { order: "desc" } },
  endangerment_asc: { endangerment_level: { order: "asc" } },
  endangerment_desc: { endangerment_level: { order: "desc" } },
  speakers_asc: { speaker_count: { order: "asc", missing: "_last" } },
  speakers_desc: { speaker_count: { order: "desc", missing: "_last" } },
  country_asc: { countries: { order: "asc", missing: "_last" } },
};

export async function searchLanguages(
  filters: LanguageFilters = {}
): Promise<{ languages: LanguageEntry[]; total: number; stats: LanguageBrowserStats }> {
  const client = getClient();
  const { page = 1, limit = 50 } = filters;
  const from = (page - 1) * limit;

  // Build bool query
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  // Text search (fuzzy + prefix for search-as-you-type)
  if (filters.search) {
    must.push({
      bool: {
        should: [
          {
            multi_match: {
              query: filters.search,
              fields: ["name^3", "name.keyword^4", "alternate_names^2", "iso_code^3", "glottocode^3", "language_family", "countries"],
              type: "best_fields",
              fuzziness: "AUTO",
            },
          },
          {
            multi_match: {
              query: filters.search,
              fields: ["name^3", "alternate_names^2", "language_family"],
              type: "phrase_prefix",
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  // Endangerment filter
  if (filters.endangerment?.length) {
    filter.push({ terms: { endangerment_status: filters.endangerment } });
  }

  // Macroarea filter
  if (filters.macroarea?.length) {
    filter.push({ terms: { macroarea: filters.macroarea } });
  }

  // Language family filter
  if (filters.family) {
    filter.push({ match: { language_family: filters.family } });
  }

  // Speaker count range
  const speakerRange: Record<string, number> = {};
  if (filters.min_speakers != null) speakerRange.gte = filters.min_speakers;
  if (filters.max_speakers != null) speakerRange.lte = filters.max_speakers;
  if (Object.keys(speakerRange).length > 0) {
    filter.push({ range: { speaker_count: speakerRange } });
  }

  // Has preservation data
  if (filters.has_preservation) {
    filter.push({ range: { "preservation_status.vocabulary_entries": { gt: 0 } } });
  }

  // Build final query
  const query =
    must.length > 0 || filter.length > 0
      ? {
          bool: {
            ...(must.length > 0 ? { must } : { must: { match_all: {} } }),
            ...(filter.length > 0 ? { filter } : {}),
          },
        }
      : { match_all: {} };

  // Sort: use relevance (_score) when searching, endangerment level when browsing
  const defaultSort = filters.search
    ? { _score: { order: "desc" } }
    : { endangerment_level: { order: "desc" } };
  const sort = SORT_MAP[filters.sort || ""] || defaultSort;

  // Run search + global stats in parallel
  const [searchResponse, stats] = await Promise.all([
    client.search<LanguageEntry>({
      index: LANGUAGES_INDEX,
      size: limit,
      from,
      query,
      sort: [sort] as any,
    }),
    getLanguageBrowserStats(),
  ]);

  const total =
    typeof searchResponse.hits.total === "number"
      ? searchResponse.hits.total
      : searchResponse.hits.total?.value ?? 0;

  const languages = searchResponse.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is LanguageEntry => src !== undefined);

  return { languages, total, stats };
}

// ---------------------------------------------------------------------------
// Languages index — get single language by glottocode
// ---------------------------------------------------------------------------

export async function getLanguage(glottocode: string): Promise<LanguageEntry | null> {
  const client = getClient();

  try {
    const response = await client.get<LanguageEntry>({
      index: LANGUAGES_INDEX,
      id: glottocode,
    });

    return response._source ?? null;
  } catch (err) {
    // 404 = not found
    if ((err as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Languages index — global stats (unfiltered aggregation)
// ---------------------------------------------------------------------------

export async function getLanguageBrowserStats(): Promise<LanguageBrowserStats> {
  const client = getClient();

  const response = await client.search({
    index: LANGUAGES_INDEX,
    size: 0,
    aggs: {
      critically_endangered: {
        filter: { term: { endangerment_status: "critically_endangered" } },
      },
      extinct: {
        filter: { term: { endangerment_status: "extinct" } },
      },
      with_preservation: {
        filter: { range: { "preservation_status.vocabulary_entries": { gt: 0 } } },
      },
    },
  });

  const total =
    typeof response.hits.total === "number"
      ? response.hits.total
      : response.hits.total?.value ?? 0;

  const aggs = response.aggregations as Record<string, { doc_count: number }> | undefined;

  return {
    total_endangered: total,
    critically_endangered: aggs?.critically_endangered?.doc_count ?? 0,
    extinct: aggs?.extinct?.doc_count ?? 0,
    with_preservation_data: aggs?.with_preservation?.doc_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Languages index — create index with mappings
// ---------------------------------------------------------------------------

export async function createLanguagesIndex(): Promise<void> {
  const client = getClient();

  const exists = await client.indices.exists({ index: LANGUAGES_INDEX });
  if (exists) {
    await client.indices.delete({ index: LANGUAGES_INDEX });
  }

  await client.indices.create({
    index: LANGUAGES_INDEX,
    settings: {
      analysis: {
        analyzer: {
          language_name: {
            type: "custom",
            tokenizer: "standard",
            filter: ["lowercase", "asciifolding"],
          },
        },
      },
    },
    mappings: {
      properties: {
        glottocode: { type: "keyword" },
        name: {
          type: "text",
          analyzer: "language_name",
          fields: { keyword: { type: "keyword" } },
        },
        iso_code: { type: "keyword" },
        alternate_names: {
          type: "text",
          analyzer: "language_name",
          fields: { keyword: { type: "keyword" } },
        },
        macroarea: { type: "keyword" },
        location: { type: "geo_point" },
        latitude: { type: "float" },
        longitude: { type: "float" },
        language_family: {
          type: "text",
          fields: { keyword: { type: "keyword" } },
        },
        endangerment_status: { type: "keyword" },
        endangerment_level: { type: "integer" },
        speaker_count: { type: "integer" },
        countries: { type: "keyword" },
        contact_languages: { type: "keyword" },
        preservation_status: {
          type: "object",
          properties: {
            sources_discovered: { type: "integer" },
            vocabulary_entries: { type: "integer" },
            audio_clips: { type: "integer" },
            last_pipeline_run: { type: "date" },
            coverage_percentage: { type: "float" },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Languages index — update preservation status after pipeline completes
// ---------------------------------------------------------------------------

export async function updatePreservationStatus(
  glottocode: string,
  status: PreservationStatus
): Promise<void> {
  const client = getClient();

  await client.update({
    index: LANGUAGES_INDEX,
    id: glottocode,
    doc: { preservation_status: status },
    refresh: "wait_for",
  });
}

// ---------------------------------------------------------------------------
// Languages index — geo bounding box query for map viewport
// ---------------------------------------------------------------------------

export async function getLanguagesInBounds(
  north: number,
  south: number,
  east: number,
  west: number
): Promise<LanguageEntry[]> {
  const client = getClient();

  const response = await client.search<LanguageEntry>({
    index: LANGUAGES_INDEX,
    size: 1000,
    query: {
      geo_bounding_box: {
        location: {
          top_left: { lat: north, lon: west },
          bottom_right: { lat: south, lon: east },
        },
      },
    },
  });

  return response.hits.hits
    .map((hit) => hit._source)
    .filter((src): src is LanguageEntry => src !== undefined);
}
