import { getErrorMessage } from "../utils/errors";
import { FeatherlessClient, Featherless } from "../apis/featherless.js";
import type { GrammarPattern, GrammarCategory, GrammarExample } from "../types";
import type { VisualContent, ScanQuality } from "../crawlers/dispatch";
import { createHash } from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractionEntry {
  headword_native: string;
  headword_romanized: string;
  pos: string;
  definitions: { language: string; text: string }[];
  example_sentences: { target: string; contact: string; english: string }[];
  audio_reference?: string;
  cultural_notes?: string;
  semantic_domain?: string;
  related_terms: string[];
  ipa?: string;
  conjugations?: { form: string; native: string; romanized: string; notes?: string }[];
  morphology?: {
    root: string;
    root_romanized: string;
    affixes: string[];
    compound_parts?: string[];
    derivation_notes?: string;
  };
  usage_register?: string;
  usage_frequency?: string;
  grammar_notes?: string;
  language_confidence?: "high" | "medium" | "low";
}

export interface ExtractionTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface ExtractionAgentResult {
  entries: ExtractionEntry[];
  grammar_patterns: GrammarPattern[];
  total_saved: number;
  token_usage: ExtractionTokenUsage;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_PRIMARY = process.env.FEATHERLESS_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const MODEL_SCAN = process.env.FEATHERLESS_VISION_MODEL || MODEL_PRIMARY;
const MAX_TOKENS = 12288;
const CHUNK_SIZE = 50_000;
const MAX_CONTENT_LENGTH = 200_000;
const BATCH_SIZE = 50;
const MAX_TURNS_PER_CHUNK = 4;
const CHUNK_CONCURRENCY = 3;

function maxTurnsForSource(sourceType: string): number {
  switch (sourceType) {
    case "dictionary":
    case "wiki":
      return 2; // Structured content — rarely needs more than 2 passes
    default:
      return MAX_TURNS_PER_CHUNK; // academic, archive, video — may need more passes
  }
}

function selectModel(_sourceType: string, hasVision: boolean = false, scanQuality?: ScanQuality): string {
  if (!hasVision) return MODEL_PRIMARY;
  if (scanQuality === "clean") return MODEL_PRIMARY;
  return MODEL_SCAN;
}

const GRAMMAR_CATEGORIES = [
  "verb_conjugation", "particle_usage", "sentence_structure",
  "honorific_system", "negation", "question_formation",
  "phonological_rule", "morphological_rule", "other",
] as const;

function buildSystemPrompt(languageName: string, ctx?: LinguisticContext, hasVision: boolean = false): string {
  // Build a linguistic profile section when metadata is available
  let linguisticProfile = "";
  if (ctx) {
    const parts: string[] = [];
    if (ctx.language_family) {
      parts.push(`- Language family: ${ctx.language_family}`);
    }
    if (ctx.native_name) {
      parts.push(`- Native name: ${ctx.native_name}`);
    }
    if (ctx.macroarea) {
      parts.push(`- Geographic region: ${ctx.macroarea}`);
    }
    if (ctx.contact_languages?.length) {
      const contactList = ctx.contact_languages.join(", ");
      parts.push(`- Contact/dominant languages: ${contactList}`);
      parts.push(`  WARNING: ${contactList} words frequently appear in sources about ${languageName}. These are NOT ${languageName} vocabulary.`);
      parts.push(`  Definitions and translations WILL appear in ${contactList} — that is expected. But the HEADWORDS you extract must be ${languageName}, not ${contactList}.`);
    }
    if (parts.length > 0) {
      linguisticProfile = `\n\n## LINGUISTIC PROFILE\n${parts.join("\n")}`;
    }
  }

  const contactLangHint = ctx?.contact_languages?.length
    ? `Use ISO 639 codes. Likely codes for this language: "en" (English)${ctx.contact_languages.map(l => {
        const map: Record<string, string> = { Korean: "ko", Japanese: "ja", Chinese: "zh", Spanish: "es", Portuguese: "pt", French: "fr", Russian: "ru", Hindi: "hi", Indonesian: "id", Arabic: "ar", Thai: "th", Turkish: "tr", Swahili: "sw", Filipino: "fil", Malay: "ms", Vietnamese: "vi", German: "de", Italian: "it", Dutch: "nl", Persian: "fa" };
        const code = map[l];
        return code ? `, "${code}" (${l})` : "";
      }).join("")}`
    : `ISO 639 code (e.g. "en", "ko", "es", "fil", "ja")`;

  return `You are a linguistic data extraction specialist. Given raw text from a web resource about the ${languageName} language, extract vocabulary entries AND grammar patterns.${linguisticProfile}

## VOCABULARY ENTRIES

For each vocabulary entry, extract:
- headword_native: the word in its native script — MUST be non-empty
- headword_romanized: romanization if available. For languages with no standard romanization, this may be empty
- pos: part of speech (noun, verb, adjective, adverb, particle, phrase, interjection, etc.)
- definitions: array of { language: ${contactLangHint}, text: definition }
- example_sentences: array of { target: string, contact: string, english: string } — "target" = the endangered language text, "contact" = the dominant/contact language translation
- ipa: IPA pronunciation transcription (if present in the source)
- conjugations: for verbs/adjectives, array of { form, native, romanized (if available), notes } for tense/mood/aspect forms found in the text
- morphology: { root, root_romanized (if available), affixes[], compound_parts[], derivation_notes } — word formation analysis if described in the source
- usage_register: formal, informal, archaic, dialectal, literary, or colloquial
- usage_frequency: common, uncommon, or rare
- grammar_notes: any grammatical observations about this word
- audio_reference: any mention of associated audio files
- cultural_notes: any cultural context or usage notes
- semantic_domain: categorize into a domain (nature, animals, plants, food, agriculture, maritime, household, tools, body, health, kinship, family, social, greetings, emotions, religion, rituals, music, trade, warfare, governance, geography, weather, time, numbers, colors, daily-life, clothing, shelter, movement, communication)
- related_terms: array of related or synonymous words

## GRAMMAR PATTERNS

Also look for language-level grammar patterns, rules, or structural descriptions in the text. These describe how the language works, not just individual words. Use save_grammar_patterns for these. Examples:
- Verb conjugation rules
- Particle or case marking usage
- Sentence structure patterns
- Honorific or register systems
- Negation patterns
- Phonological rules (e.g., vowel harmony, consonant mutations, tone patterns)

Be thorough — extract EVERY vocabulary entry and grammar pattern you can find.

Call save_entries with vocabulary entries and save_grammar_patterns with grammar rules. You may call each multiple times with batches.

CRITICAL RULES:
- Do NOT create a vocabulary entry unless you can identify the ACTUAL ${languageName} word in native script in the source text.
- Do NOT fabricate or guess headwords — only extract what is explicitly present in the content.
- An entry without a real headword_native is useless. Quality over quantity.
- For conjugations, morphology, IPA, and usage: only include what the source text explicitly states or clearly implies. Do NOT fabricate linguistic data.
- Grammar patterns should describe rules/patterns, not just individual word translations.
- For each entry, rate your language_confidence: "high" if the source explicitly labels it as ${languageName}, "medium" if likely but ambiguous, "low" if it might be a contact/dominant language word.${ctx?.contact_languages?.length ? `

## CONTACT LANGUAGE CONTAMINATION PREVENTION
You MUST NOT extract ${ctx.contact_languages.join("/")} words as ${languageName} vocabulary entries. This is the #1 source of data quality errors.

REJECT a word if:
- It is a common ${ctx.contact_languages.join("/")} word and the source does not explicitly identify it as ${languageName}
- The source presents it as a translation/gloss for a ${languageName} word (it belongs in "definitions", not as a headword)
- You recognize it as ${ctx.contact_languages.join("/")} vocabulary and the source provides no evidence it has been adopted into ${languageName}

ACCEPT a word if:
- The source explicitly labels it as ${languageName} (e.g., in a dictionary entry, word list, or vocabulary table)
- It is identified as a loanword adopted into ${languageName} — note "loanword from [language]" in cultural_notes
- The source provides ${languageName}-specific morphology, conjugation, or usage that distinguishes it from the contact language form` : `

## LANGUAGE IDENTIFICATION
Only extract words that the source explicitly identifies as ${languageName}. Do not extract words from other languages that appear in the source as translations, glosses, or metalanguage.`}${hasVision ? `

## VISUAL CONTENT INSTRUCTIONS
This source contains scanned or image-based content. Additional guidelines:
1. Read ALL visible text in the images/document: printed, handwritten, tables, annotations, marginalia, interlinear glosses.
2. Transcribe headwords exactly as they appear. Capture both native script and romanization if both are visible.
3. Note OCR uncertainty in grammar_notes when characters are ambiguous (e.g., "character unclear in scan").
4. Preserve structural relationships (dictionary entry layout, conjugation tables, paradigm charts).
5. These archival sources are irreplaceable — extract EVERY entry visible, even partial ones.` : ""}`;
}

// ─── Tool definition ─────────────────────────────────────────────────────────

const ENTRY_SCHEMA = {
  type: "object" as const,
  properties: {
    headword_native: { type: "string" as const, minLength: 1, description: "The word in native script — MUST be non-empty. If you cannot identify the actual word, do NOT create an entry." },
    headword_romanized: { type: "string" as const, description: "Romanization if available — may be empty for languages without standard romanization" },
    pos: {
      type: "string" as const,
      enum: ["noun", "verb", "adjective", "adverb", "particle", "phrase", "interjection"],
    },
    definitions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          language: { type: "string" as const, description: "ISO 639 language code for this definition (e.g. 'en', 'ko', 'es', 'fil', 'ja')" },
          text: { type: "string" as const },
        },
        required: ["language", "text"],
      },
    },
    example_sentences: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          target: { type: "string" as const, description: "The sentence in the target (endangered) language" },
          contact: { type: "string" as const, description: "Translation in the contact/dominant language" },
          english: { type: "string" as const },
        },
        required: ["target"],
      },
    },
    ipa: { type: "string" as const, description: "IPA pronunciation, e.g. /padaŋ/" },
    conjugations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          form: { type: "string" as const, description: "Conjugation form: past, present, future, imperative, honorific, etc." },
          native: { type: "string" as const, description: "Conjugated form in native script" },
          romanized: { type: "string" as const },
          notes: { type: "string" as const },
        },
        required: ["form", "native"],
      },
      description: "Verb/adjective conjugation forms found in the source",
    },
    morphology: {
      type: "object" as const,
      properties: {
        root: { type: "string" as const, description: "Root/stem form in native script" },
        root_romanized: { type: "string" as const },
        affixes: { type: "array" as const, items: { type: "string" as const } },
        compound_parts: { type: "array" as const, items: { type: "string" as const } },
        derivation_notes: { type: "string" as const },
      },
      required: ["root", "affixes"],
    },
    usage_register: {
      type: "string" as const,
      enum: ["formal", "informal", "archaic", "dialectal", "literary", "colloquial"],
    },
    usage_frequency: {
      type: "string" as const,
      enum: ["common", "uncommon", "rare"],
    },
    grammar_notes: { type: "string" as const, description: "Grammatical observations about this word" },
    audio_reference: { type: "string" as const },
    cultural_notes: { type: "string" as const },
    semantic_domain: { type: "string" as const },
    related_terms: { type: "array" as const, items: { type: "string" as const } },
    language_confidence: {
      type: "string" as const,
      enum: ["high", "medium", "low"],
      description: "How confident are you that this word is genuinely in the target endangered language and NOT a contact/dominant language word? 'high' = source explicitly labels it as the target language or it has distinctive target-language morphology. 'medium' = likely target language but source context is ambiguous. 'low' = possibly a contact/dominant language word or uncertain provenance.",
    },
  },
  required: ["headword_native", "pos", "definitions", "language_confidence"],
};

const GRAMMAR_PATTERN_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Descriptive title, e.g. 'Past Tense Conjugation (-았/었-)'" },
    title_native: { type: "string" as const, description: "Title in native script if appropriate" },
    category: {
      type: "string" as const,
      enum: [...GRAMMAR_CATEGORIES],
      description: "Grammar category",
    },
    description: { type: "string" as const, description: "Explanation of the grammar pattern/rule" },
    rule: { type: "string" as const, description: "Formal rule, e.g. 'V-stem + -았/었 + ending'" },
    examples: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          target: { type: "string" as const, description: "Example in the target (endangered) language" },
          contact: { type: "string" as const, description: "Translation in the contact/dominant language" },
          english: { type: "string" as const },
          annotation: { type: "string" as const, description: "Grammatical gloss or breakdown" },
        },
        required: ["target", "english"],
      },
    },
    related_vocabulary: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Headwords (native) that demonstrate this pattern",
    },
    differences_from_contact: { type: "string" as const, description: "How this differs from the contact/dominant language" },
  },
  required: ["title", "category", "description"],
};

const TOOLS: Featherless.Tool[] = [
  {
    name: "save_entries",
    cache_control: { type: "ephemeral" as const },
    description:
      "Save a batch of extracted vocabulary entries. Call this with all entries found in the content. For large extractions, you may call this multiple times with batches.",
    input_schema: {
      type: "object" as const,
      properties: {
        entries: {
          type: "array" as const,
          items: ENTRY_SCHEMA,
          description: "Array of vocabulary entries extracted from the content",
        },
      },
      required: ["entries"],
    },
  },
  {
    name: "save_grammar_patterns",
    cache_control: { type: "ephemeral" as const },
    description:
      "Save grammar patterns, rules, or structural descriptions of the language found in the content. These describe how the language works (conjugation rules, particle usage, sentence structure, phonological rules, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        patterns: {
          type: "array" as const,
          items: GRAMMAR_PATTERN_SCHEMA,
          description: "Array of grammar patterns extracted from the content",
        },
      },
      required: ["patterns"],
    },
  },
];

// ─── Content chunking ────────────────────────────────────────────────────────

function chunkContent(content: string): string[] {
  if (content.length <= CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    // Find a paragraph break near the chunk boundary
    let splitAt = remaining.lastIndexOf("\n\n", CHUNK_SIZE);
    if (splitAt < CHUNK_SIZE * 0.5) {
      // No good paragraph break — try a single newline
      splitAt = remaining.lastIndexOf("\n", CHUNK_SIZE);
    }
    if (splitAt < CHUNK_SIZE * 0.5) {
      // No good break at all — hard cut
      splitAt = CHUNK_SIZE;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// ─── Parse entries from tool input ───────────────────────────────────────────

function parseEntries(rawEntries: unknown[]): ExtractionEntry[] {
  const entries: ExtractionEntry[] = [];

  for (const raw of rawEntries) {
    try {
      const r = raw as Record<string, unknown>;
      const native = String(r.headword_native ?? "").trim();
      const romanized = String(r.headword_romanized ?? "").trim();
      const pos = String(r.pos ?? "").trim();
      if (!native || !pos) continue;

      const defs = Array.isArray(r.definitions) ? r.definitions : [];
      const examples = Array.isArray(r.example_sentences) ? r.example_sentences : [];
      const related = Array.isArray(r.related_terms) ? r.related_terms : [];
      const rawConj = Array.isArray(r.conjugations) ? r.conjugations : [];
      const rawMorph = r.morphology as Record<string, unknown> | undefined;

      const entry: ExtractionEntry = {
        headword_native: native,
        headword_romanized: romanized,
        pos,
        definitions: defs.map((d: Record<string, unknown>) => ({
          language: String(d.language || "en"),
          text: String(d.text ?? ""),
        })),
        example_sentences: examples.map((e: Record<string, unknown>) => ({
          target: String(e.target ?? ""),
          contact: String(e.contact ?? ""),
          english: String(e.english ?? ""),
        })),
        audio_reference: r.audio_reference ? String(r.audio_reference) : undefined,
        cultural_notes: r.cultural_notes ? String(r.cultural_notes) : undefined,
        semantic_domain: r.semantic_domain ? String(r.semantic_domain) : undefined,
        related_terms: related.map(String),
      };

      // Language confidence (default to "medium" if not provided)
      const rawConfidence = String(r.language_confidence ?? "medium");
      entry.language_confidence = (["high", "medium", "low"].includes(rawConfidence)
        ? rawConfidence
        : "medium") as "high" | "medium" | "low";

      // New linguistic fields (all optional)
      if (r.ipa) entry.ipa = String(r.ipa);
      if (r.grammar_notes) entry.grammar_notes = String(r.grammar_notes);
      if (r.usage_register) entry.usage_register = String(r.usage_register);
      if (r.usage_frequency) entry.usage_frequency = String(r.usage_frequency);

      if (rawConj.length > 0) {
        entry.conjugations = rawConj
          .map((c: Record<string, unknown>) => ({
            form: String(c.form ?? ""),
            native: String(c.native ?? ""),
            romanized: String(c.romanized ?? ""),
            notes: c.notes ? String(c.notes) : undefined,
          }))
          .filter((c) => c.form && c.native);
      }

      if (rawMorph && rawMorph.root) {
        const affixes = Array.isArray(rawMorph.affixes) ? rawMorph.affixes.map(String) : [];
        const compoundParts = Array.isArray(rawMorph.compound_parts) ? rawMorph.compound_parts.map(String) : undefined;
        entry.morphology = {
          root: String(rawMorph.root),
          root_romanized: String(rawMorph.root_romanized ?? ""),
          affixes,
          compound_parts: compoundParts,
          derivation_notes: rawMorph.derivation_notes ? String(rawMorph.derivation_notes) : undefined,
        };
      }

      entries.push(entry);
    } catch {
      // Skip malformed entries — don't crash the whole batch
      continue;
    }
  }

  return entries;
}

function parseGrammarPatterns(rawPatterns: unknown[], sourceUrl: string): GrammarPattern[] {
  const patterns: GrammarPattern[] = [];

  for (const raw of rawPatterns) {
    try {
      const r = raw as Record<string, unknown>;
      const title = String(r.title ?? "").trim();
      const category = String(r.category ?? "other").trim() as GrammarCategory;
      const description = String(r.description ?? "").trim();
      if (!title || !description) continue;

      const rawExamples = Array.isArray(r.examples) ? r.examples : [];
      const rawRelVocab = Array.isArray(r.related_vocabulary) ? r.related_vocabulary : [];

      const id = `gram-${createHash("sha256").update(title).digest("hex").slice(0, 16)}`;

      patterns.push({
        id,
        title,
        title_native: r.title_native ? String(r.title_native) : undefined,
        category: GRAMMAR_CATEGORIES.includes(category as typeof GRAMMAR_CATEGORIES[number])
          ? category
          : "other",
        description,
        rule: r.rule ? String(r.rule) : undefined,
        examples: rawExamples.map((e: Record<string, unknown>): GrammarExample => ({
          target: String(e.target ?? ""),
          contact: e.contact ? String(e.contact) : undefined,
          english: String(e.english ?? ""),
          annotation: e.annotation ? String(e.annotation) : undefined,
        })).filter((e) => e.target || e.english),
        related_vocabulary: rawRelVocab.map(String),
        differences_from_contact: r.differences_from_contact ? String(r.differences_from_contact) : undefined,
        source_urls: [sourceUrl],
        confidence: "medium",
        created_at: new Date().toISOString(),
      });
    } catch {
      continue;
    }
  }

  return patterns;
}

// ─── Content preprocessing ──────────────────────────────────────────────────

function preprocessContent(content: string): string {
  let text = content;

  // Remove common cookie consent / newsletter / share button patterns
  text = text.replace(
    /(?:accept\s+(?:all\s+)?cookies|cookie\s+(?:policy|settings|preferences)|we\s+use\s+cookies|manage\s+consent|newsletter\s+sign\s*up|subscribe\s+to\s+(?:our\s+)?newsletter|share\s+(?:on|via)\s+(?:facebook|twitter|linkedin|email)|follow\s+us\s+on)/gi,
    ""
  );

  // Remove lines that are just bare URLs
  text = text.replace(/^https?:\/\/\S+$/gm, "");

  // Remove very short navigation-like lines (1-3 words, pure ASCII, no punctuation)
  // Preserves lines with non-ASCII text (any script: Hangul, Arabic, Devanagari, Latin diacritics, etc.)
  text = text.replace(
    /^.{1,20}$/gm,
    (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;
      // Keep lines that contain any non-ASCII characters (likely linguistic content)
      if (/[^\x00-\x7F]/.test(trimmed)) return match;
      const words = trimmed.split(/\s+/);
      if (words.length <= 3 && !/[.!?;:,]/.test(trimmed)) return "";
      return match;
    }
  );

  // Remove common non-content markers
  text = text.replace(
    /(?:skip\s+to\s+(?:main\s+)?content|back\s+to\s+top|loading\.\.\.|page\s+\d+\s+of\s+\d+|all\s+rights\s+reserved|copyright\s+\d{4}|terms\s+(?:of\s+(?:service|use))|privacy\s+policy)/gi,
    ""
  );

  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // Collapse multiple spaces/tabs to single space
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
}

// ─── Agent runner ────────────────────────────────────────────────────────────

export interface LinguisticContext {
  contact_languages?: string[];
  language_family?: string;
  native_name?: string;
  macroarea?: string;
}

// ─── Multimodal content builder ──────────────────────────────────────────────

function buildUserContent(
  chunk: string,
  sourceTitle: string,
  sourceUrl: string,
  sourceType: string,
  chunkLabel: string,
  visualContent?: VisualContent
): string | Featherless.ContentBlockParam[] {
  if (!visualContent) {
    return `Extract all vocabulary entries and grammar patterns from the following content.

Source: "${sourceTitle}" (${sourceUrl})
Type: ${sourceType}${chunkLabel}

CONTENT:
${chunk}`;
  }

  const blocks: Featherless.ContentBlockParam[] = [];

  blocks.push({
    type: "text",
    text: `Extract all vocabulary entries and grammar patterns from the following source.

Source: "${sourceTitle}" (${sourceUrl})
Type: ${sourceType}
Note: This source contains scanned/image-based content. Read all text visible in the images carefully.${chunkLabel}

${chunk && chunk.length > 10 ? `EXTRACTED TEXT (may be partial or garbled from OCR):\n${chunk}\n\n` : ""}The primary content is in the document/images below:`,
  });

  if (visualContent.pdf_base64) {
    blocks.push({
      type: "document",
      cache_control: { type: "ephemeral" },
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: visualContent.pdf_base64,
      },
      title: sourceTitle,
    } as Featherless.DocumentBlockParam);
  }

  if (visualContent.images?.length) {
    for (let i = 0; i < visualContent.images.length; i++) {
      const img = visualContent.images[i];
      const isLast = i === visualContent.images.length - 1;
      blocks.push({
        type: "image",
        // Cache the last image block so the entire user message gets cached
        ...(isLast ? { cache_control: { type: "ephemeral" } } : {}),
        source: {
          type: "base64",
          media_type: img.media_type,
          data: img.data,
        },
      } as Featherless.ImageBlockParam);
    }
  }

  return blocks;
}

// ─── Agent runner ────────────────────────────────────────────────────────────

export async function runExtractionAgent(
  content: string,
  sourceUrl: string,
  sourceTitle: string,
  sourceType: string,
  language_code: string,
  language_name: string,
  onProgress: (message: string, count: number) => void,
  onSaveEntries: (entries: ExtractionEntry[]) => Promise<{ saved: number }>,
  onSaveGrammarPatterns?: (patterns: GrammarPattern[]) => Promise<{ saved: number }>,
  linguisticContext?: LinguisticContext,
  visualContent?: VisualContent,
  signal?: AbortSignal
): Promise<ExtractionAgentResult> {
  const client = new FeatherlessClient({ maxRetries: 3 });
  const allEntries: ExtractionEntry[] = [];
  const allGrammarPatterns: GrammarPattern[] = [];
  let totalSaved = 0;

  // Token tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;

  const trackUsage = (response: Featherless.Message): void => {
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCacheReadTokens += (response.usage as unknown as Record<string, number>).cache_read_input_tokens || 0;
    totalCacheCreationTokens += (response.usage as unknown as Record<string, number>).cache_creation_input_tokens || 0;
  };

  const hasVision = !!(visualContent?.pdf_base64 || visualContent?.images?.length);

  // Content quality gate — skip sources that are too short to extract from
  // (vision sources bypass this gate since content is in images, not text)
  const MIN_EXTRACTABLE_LENGTH = 300;
  if (!hasVision && content.length < MIN_EXTRACTABLE_LENGTH) {
    onProgress(`Skipping ${sourceTitle}: content too short (${content.length} chars)`, 0);
    return { entries: [], grammar_patterns: [], total_saved: 0, token_usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 } };
  }

  onProgress(`Analyzing content from ${sourceTitle}...`, 0);

  // Truncate excessively large content (e.g., garbled PDF binary parsed as text)
  const trimmedContent = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH)
    : content;

  if (content.length > MAX_CONTENT_LENGTH) {
    const truncatedKB = Math.round((content.length - MAX_CONTENT_LENGTH) / 1024);
    onProgress(
      `Warning: ${sourceTitle} content truncated from ${Math.round(content.length / 1024)}KB to ${Math.round(MAX_CONTENT_LENGTH / 1024)}KB (${truncatedKB}KB discarded). Some entries may be missing.`,
      0
    );
  }

  // Strip boilerplate before chunking to reduce token count
  const cleanedContent = preprocessContent(trimmedContent);

  // Scanned-content fast path: run a single pass over extracted text/OCR context.
  if (hasVision) {
    const visionModel = selectModel(sourceType, true, visualContent?.scan_quality);
    console.log(`[ExtractionAgent] Scanned content: quality=${visualContent?.scan_quality ?? "unknown"}, model=${visionModel}, source=${sourceUrl}`);
    onProgress(`Processing scanned content from ${sourceTitle} with Featherless...`, 0);

    const userContent = buildUserContent(cleanedContent, sourceTitle, sourceUrl, sourceType, "", visualContent);
    const messages: Featherless.MessageParam[] = [
      { role: "user", content: userContent },
    ];

    const chunkEntries: ExtractionEntry[] = [];
    const chunkGrammarPatterns: GrammarPattern[] = [];
    let chunkSaved = 0;

    for (let turn = 0; turn < maxTurnsForSource(sourceType); turn++) {
      if (signal?.aborted) break;

      let response: Featherless.Message;
      try {
        response = await client.messages.create({
          model: visionModel,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          system: [{ type: "text" as const, text: buildSystemPrompt(language_name, linguisticContext, true), cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        console.error(`[ExtractionAgent] Featherless scanned-content error on turn ${turn}: ${getErrorMessage(err)}`);
        break;
      }

      trackUsage(response);

      const hasToolUse = response.content.some((b) => b.type === "tool_use");
      if (!hasToolUse || response.stop_reason === "end_turn") break;

      const toolResults: Featherless.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "save_entries") {
          const input = block.input as { entries?: unknown[] };
          const entries = parseEntries(input.entries || []);
          if (entries.length === 0) {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "No valid entries to save." });
            continue;
          }
          chunkEntries.push(...entries);
          const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
          for (let b = 0; b < totalBatches; b++) {
            const batch = entries.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            try {
              const result = await onSaveEntries(batch);
              chunkSaved += result.saved;
            } catch (err) {
              console.error(`[ExtractionAgent] Scanned-content save failed: ${getErrorMessage(err)}`);
            }
          }
          onProgress(`Scanned-content extraction: ${chunkEntries.length} entries found so far...`, chunkEntries.length);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "OK" });
        } else if (block.name === "save_grammar_patterns") {
          const input = block.input as { patterns?: unknown[] };
          const patterns = parseGrammarPatterns(input.patterns || [], sourceUrl);
          if (patterns.length > 0) {
            chunkGrammarPatterns.push(...patterns);
            if (onSaveGrammarPatterns) {
              try { await onSaveGrammarPatterns(patterns); } catch { /* skip */ }
            }
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "OK" });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    return { entries: chunkEntries, grammar_patterns: chunkGrammarPatterns, total_saved: chunkSaved, token_usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, cache_read_tokens: totalCacheReadTokens, cache_creation_tokens: totalCacheCreationTokens } };
  }

  const chunks = chunkContent(cleanedContent);
  const totalChunks = chunks.length;

  // Process a single chunk — returns entries and grammar patterns found
  const processChunk = async (
    chunk: string,
    chunkIdx: number
  ): Promise<{ entries: ExtractionEntry[]; grammarPatterns: GrammarPattern[]; saved: number }> => {
    const chunkEntries: ExtractionEntry[] = [];
    const chunkGrammarPatterns: GrammarPattern[] = [];
    let chunkSaved = 0;

    if (totalChunks > 1) {
      onProgress(`Processing chunk ${chunkIdx + 1}/${totalChunks}...`, 0);
    }

    const chunkLabel = totalChunks > 1
      ? `\n\n[This is section ${chunkIdx + 1} of ${totalChunks}]`
      : "";

    const messages: Featherless.MessageParam[] = [
      {
        role: "user",
        content: buildUserContent(chunk, sourceTitle, sourceUrl, sourceType, chunkLabel),
      },
    ];

    for (let turn = 0; turn < maxTurnsForSource(sourceType); turn++) {
      if (signal?.aborted) break;

      let response: Featherless.Message;
      try {
        response = await client.messages.create({
          model: selectModel(sourceType),
          max_tokens: MAX_TOKENS,
          temperature: 0,
          system: [{ type: "text" as const, text: buildSystemPrompt(language_name, linguisticContext), cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages,
        });
      } catch (err) {
        console.error(
          `[ExtractionAgent] Featherless API error on chunk ${chunkIdx + 1}, turn ${turn}: ${getErrorMessage(err)}`
        );
        break;
      }

      trackUsage(response);

      const hasToolUse = response.content.some((b) => b.type === "tool_use");
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }

      const toolResults: Featherless.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "save_entries") {
          const input = block.input as { entries?: unknown[] };
          const rawEntries = input.entries || [];
          const entries = parseEntries(rawEntries);

          if (entries.length === 0) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "No valid entries to save. Make sure each entry has headword_native, pos, and definitions.",
            });
            continue;
          }

          chunkEntries.push(...entries);

          // Save in batches of 50
          const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
          let batchSaved = 0;

          for (let b = 0; b < totalBatches; b++) {
            const batch = entries.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

            if (totalBatches > 1) {
              onProgress(
                `Chunk ${chunkIdx + 1}: saving batch ${b + 1}/${totalBatches} (${batch.length} entries)...`,
                chunkEntries.length
              );
            }

            try {
              const result = await onSaveEntries(batch);
              batchSaved += result.saved;
              chunkSaved += result.saved;
            } catch (err) {
              console.error(`[ExtractionAgent] Save failed: ${getErrorMessage(err)}`);
            }
          }

          onProgress(`Chunk ${chunkIdx + 1}: found ${entries.length} vocabulary entries`, chunkEntries.length);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "OK",
          });
        } else if (block.name === "save_grammar_patterns") {
          const input = block.input as { patterns?: unknown[] };
          const rawPatterns = input.patterns || [];
          const patterns = parseGrammarPatterns(rawPatterns, sourceUrl);

          if (patterns.length === 0) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "No valid grammar patterns to save.",
            });
            continue;
          }

          chunkGrammarPatterns.push(...patterns);

          if (onSaveGrammarPatterns) {
            try {
              await onSaveGrammarPatterns(patterns);
            } catch (err) {
              console.error(`[ExtractionAgent] Grammar save failed: ${getErrorMessage(err)}`);
            }
          }

          onProgress(`Chunk ${chunkIdx + 1}: found ${patterns.length} grammar patterns`, chunkEntries.length);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "OK",
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    return { entries: chunkEntries, grammarPatterns: chunkGrammarPatterns, saved: chunkSaved };
  };

  // Process chunks with limited parallelism
  for (let i = 0; i < totalChunks; i += CHUNK_CONCURRENCY) {
    if (signal?.aborted) break;

    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map((chunk, offsetIdx) => processChunk(chunk, i + offsetIdx))
    );
    for (const result of results) {
      allEntries.push(...result.entries);
      allGrammarPatterns.push(...result.grammarPatterns);
      totalSaved += result.saved;
    }
  }

  return {
    entries: allEntries,
    grammar_patterns: allGrammarPatterns,
    total_saved: totalSaved,
    token_usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_read_tokens: totalCacheReadTokens,
      cache_creation_tokens: totalCacheCreationTokens,
    },
  };
}
