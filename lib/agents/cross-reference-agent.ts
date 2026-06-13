import { getErrorMessage } from "../utils/errors";
import { FeatherlessClient, Featherless } from "../apis/featherless.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrossRefEntry {
  headword_native: string;
  headword_romanized?: string;
  pos: string;
  definitions: { language: string; text: string }[];
  example_sentences: { target: string; contact?: string; english?: string }[];
  semantic_domain?: string;
  related_terms: string[];
  source_url: string;
  source_title: string;
}

export interface SearchResult {
  id: string;
  headword_native: string;
  headword_romanized?: string;
  pos: string;
  definitions: { language: string; text: string }[];
  semantic_cluster?: string;
  cross_references?: { source_title: string; source_url: string; source_type: string }[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface CrossRefResult {
  merged_count: number;
  clusters: string[];
  processed: number;
  token_usage: TokenUsage;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL = process.env.FEATHERLESS_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const MAX_TOKENS = 8_192;
const BATCH_SIZE = 50;
const MAX_TURNS_PER_BATCH = 4;

function buildSystemPrompt(languageName: string): string {
  return `You are a cross-referencing specialist for an endangered language vocabulary database (${languageName}).

Your job is to find duplicate or related entries across different sources and merge them intelligently.

Merge considerations:
- Phonological similarity: different transcription systems may render the same phoneme differently
- Semantic overlap: two entries may define the same concept with different glosses
- FALSE MERGE risk: merging two distinct words is worse than missing a duplicate

Script variant awareness:
- The same word may be spelled differently across sources due to transcription conventions
- Romanization may vary across sources (different transliteration standards)
- Treat variant spellings of the same word as the SAME entry and merge them
- But be careful: similar-looking words can have different meanings (e.g. 바당 "sea" vs 바닥 "floor")

Merge strategy:
1. Use search_existing to check if each new entry already exists in the database
2. When a match is found, call merge_entries to combine them:
   - Keep ALL definitions from both sources (do not discard any)
   - Keep ALL example sentences from both sources
   - Merge related_terms (union, no duplicates)
   - Add cross-references linking both sources
   - If semantic domains differ, keep the more specific one
3. Assign a semantic cluster to each entry if not already assigned

Semantic clusters: maritime, kinship, agriculture, weather, food, greetings, tools, animals, plants, rituals, geography, emotions, daily-life, body, numbers, colors, time, nature, household.

Be thorough — check every entry. Even partial matches (same headword, different POS) should be noted.`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Featherless.Tool[] = [
  {
    name: "search_existing",
    description:
      "Search the existing vocabulary database for a headword or romanized form to find potential duplicates or related entries. Try both native script and romanized forms.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "The headword to search for — can be in native script or romanized form",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "merge_entries",
    cache_control: { type: "ephemeral" as const },
    description:
      "Merge a new entry with an existing database entry that represents the same word. Combines definitions, examples, cross-references, and related terms from both sources.",
    input_schema: {
      type: "object" as const,
      properties: {
        primary_id: {
          type: "string",
          description: "ID of the existing entry in the database (the merge target)",
        },
        secondary_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs of additional existing entries to merge (if multiple duplicates found)",
        },
        merged_data: {
          type: "object" as const,
          properties: {
            definitions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  language: { type: "string", description: "ISO 639 language code (e.g. 'en', 'ko', 'es', 'fil')" },
                  text: { type: "string" },
                },
                required: ["language", "text"],
              },
              description: "Combined definitions from all sources",
            },
            example_sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  target: { type: "string", description: "Sentence in the target (endangered) language" },
                  contact: { type: "string", description: "Translation in the contact/dominant language" },
                  english: { type: "string" },
                },
                required: ["target"],
              },
              description: "Combined example sentences from all sources",
            },
            cross_references: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source_title: { type: "string" },
                  source_url: { type: "string" },
                  source_type: { type: "string" },
                },
                required: ["source_title", "source_url"],
              },
              description: "Cross-references linking all sources where this word appears",
            },
            related_terms: {
              type: "array",
              items: { type: "string" },
              description: "Union of related terms from all sources",
            },
            semantic_domain: {
              type: "string",
              description: "The most specific semantic domain for this entry",
            },
          },
          description: "The merged data combining all sources",
        },
      },
      required: ["primary_id", "merged_data"],
    },
  },
];

// ─── Agent runner ────────────────────────────────────────────────────────────

export async function runCrossReferenceAgent(
  entries: CrossRefEntry[],
  sourceTitle: string,
  languageName: string,
  onProgress: (message: string, count: number) => void,
  onSearchExisting: (query: string) => Promise<SearchResult[]>,
  onMergeEntries: (
    primaryId: string,
    secondaryIds: string[],
    mergedData: Record<string, unknown>
  ) => Promise<void>,
): Promise<CrossRefResult> {
  const client = new FeatherlessClient({ maxRetries: 3 });
  let totalMerged = 0;
  const allClusters = new Set<string>();
  let totalProcessed = 0;

  // Token tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;

  if (entries.length === 0) {
    return { merged_count: 0, clusters: [], processed: 0, token_usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 } };
  }

  onProgress(`Cross-referencing ${entries.length} entries from ${sourceTitle}...`, 0);

  // Split into batches of 20
  const batches: CrossRefEntry[][] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(entries.slice(i, i + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    if (batches.length > 1) {
      onProgress(
        `Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} entries)...`,
        totalProcessed
      );
    }

    const entrySummary = batch
      .map(
        (e, i) =>
          `[${i}] ${e.headword_native} (${e.headword_romanized}) — ${e.pos} — ${e.definitions.map((d) => d.text).join("; ")} [from: ${e.source_title}]`
      )
      .join("\n");

    const messages: Featherless.MessageParam[] = [
      {
        role: "user",
        content: `Cross-reference the following ${batch.length} newly extracted entries from "${sourceTitle}".

For each entry:
1. Call search_existing with the native headword to check for duplicates
2. If a match is found, call merge_entries to combine them
3. Note any semantic clusters you identify

NEW ENTRIES:
${entrySummary}`,
      },
    ];

    for (let turn = 0; turn < MAX_TURNS_PER_BATCH; turn++) {
      let response: Featherless.Message;
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          system: [{ type: "text" as const, text: buildSystemPrompt(languageName), cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        console.error(
          `[CrossRefAgent] Featherless API error on batch ${batchIdx + 1}, turn ${turn}: ${getErrorMessage(err)}`
        );
        break;
      }

      // Accumulate token usage
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCacheReadTokens += (response.usage as unknown as Record<string, number>).cache_read_input_tokens || 0;
      totalCacheCreationTokens += (response.usage as unknown as Record<string, number>).cache_creation_input_tokens || 0;

      const hasToolUse = response.content.some((b) => b.type === "tool_use");
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }

      const toolResults: Featherless.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, unknown>;

        if (block.name === "search_existing") {
          const query = input.query as string;

          let results: SearchResult[] = [];
          try {
            results = await onSearchExisting(query);
          } catch (err) {
            console.warn(
              `[CrossRefAgent] Search failed for "${query}": ${getErrorMessage(err)}`
            );
          }

          if (results.length > 0) {
            const formatted = results
              .map(
                (r) =>
                  `- id="${r.id}" ${r.headword_native} (${r.headword_romanized}) [${r.pos}]: ${r.definitions.map((d) => d.text).join("; ")}${r.semantic_cluster ? ` [cluster: ${r.semantic_cluster}]` : ""}`
              )
              .join("\n");
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Found ${results.length} existing entries:\n${formatted}`,
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `No existing entries found for "${query}".`,
            });
          }
        } else if (block.name === "merge_entries") {
          const primaryId = input.primary_id as string;
          const secondaryIds = (input.secondary_ids as string[]) || [];
          const mergedData = (input.merged_data as Record<string, unknown>) || {};

          try {
            await onMergeEntries(primaryId, secondaryIds, mergedData);
            totalMerged++;

            // Track semantic domain as cluster
            const domain = mergedData.semantic_domain as string | undefined;
            if (domain) {
              allClusters.add(domain);
            }

            onProgress(`Linked entry across sources (${totalMerged} total merges)`, totalProcessed);

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "OK",
            });
          } catch (err) {
            console.error(
              `[CrossRefAgent] Merge failed for ${primaryId}: ${getErrorMessage(err)}`
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Merge failed: ${getErrorMessage(err)}`,
              is_error: true,
            });
          }
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    totalProcessed += batch.length;
  }

  return {
    merged_count: totalMerged,
    clusters: [...allClusters],
    processed: totalProcessed,
    token_usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_read_tokens: totalCacheReadTokens,
      cache_creation_tokens: totalCacheCreationTokens,
    },
  };
}
