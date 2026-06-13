import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_GRAMMAR_PATTERNS,
  DEMO_LANGUAGES_RESPONSE,
  DEMO_OVERVIEWS,
  DEMO_SOURCES,
  searchDemoVocabulary,
} from "@/lib/demo-data";

const FEATHERLESS_CHAT_URL = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

type FeatherlessChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function sse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify({ data })}\n\n`;
}

function chunkText(text: string, size = 120) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function definition(entry: ReturnType<typeof searchDemoVocabulary>["entries"][number]) {
  return entry.definitions.find((item) => item.language === "en")?.text ?? "";
}

function buildArchiveContext(message: string, languageName?: string, languageCode?: string) {
  const language =
    DEMO_LANGUAGES_RESPONSE.languages.find(
      (item) => item.iso_code === languageCode || item.name === languageName
    ) ?? DEMO_LANGUAGES_RESPONSE.languages[0];

  const vocabSearch = searchDemoVocabulary(message, {
    language_code: language.iso_code,
    limit: 6,
  });
  const vocabulary = (vocabSearch.entries.length
    ? vocabSearch.entries
    : searchDemoVocabulary("", { language_code: language.iso_code, limit: 8 }).entries
  ).map((entry) => ({
    term: entry.headword_native,
    romanized: entry.headword_romanized,
    partOfSpeech: entry.pos,
    definition: definition(entry),
    semanticCluster: entry.semantic_cluster,
    sourceCount: entry.cross_references.length,
  }));

  return {
    language: {
      name: language.name,
      isoCode: language.iso_code,
      glottocode: language.glottocode,
      family: language.language_family,
      status: language.endangerment_status,
      speakers: language.speaker_count,
      preservation: language.preservation_status,
    },
    overview: DEMO_OVERVIEWS[language.glottocode],
    vocabulary,
    grammar: DEMO_GRAMMAR_PATTERNS.slice(0, 4).map((pattern) => ({
      title: pattern.title,
      category: pattern.category,
      description: pattern.description,
      examples: pattern.examples.slice(0, 2),
      relatedVocabulary: pattern.related_vocabulary,
      confidence: pattern.confidence,
    })),
    sources: DEMO_SOURCES.map((source) => ({
      title: source.title,
      type: source.type,
      entries: source.entry_count,
      grammarPatterns: source.grammar_count,
      status: source.status,
    })),
    globalStats: DEMO_LANGUAGES_RESPONSE.stats,
  };
}

function fallbackAnswer(message: string, languageName?: string, languageCode?: string) {
  const context = buildArchiveContext(message, languageName, languageCode);
  const topWords = context.vocabulary
    .slice(0, 4)
    .map((entry) => `- **${entry.term}** (${entry.romanized}): ${entry.definition}`)
    .join("\n");
  const grammar = context.grammar[0];

  return `I can answer from LangSafe's demo archive for **${context.language.name}**.

**Archive snapshot**
- Status: ${context.language.status.replace(/_/g, " ")}
- Estimated speakers: ${context.language.speakers?.toLocaleString() ?? "unknown"}
- Preserved entries: ${context.language.preservation?.vocabulary_entries.toLocaleString() ?? "demo entries unavailable"}
- Sources: ${context.language.preservation?.sources_discovered ?? context.sources.length}

**Relevant vocabulary**
${topWords}

**Grammar focus**
${grammar.title}: ${grammar.description}

**Suggested next step**
Open the Studio tab to verify these entries with a speaker, teacher, or linguist, then generate a lesson pack from the reviewed vocabulary.`;
}

async function askFeatherless(message: string, languageName?: string, languageCode?: string) {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  const model = process.env.FEATHERLESS_MODEL || DEFAULT_MODEL;
  const context = buildArchiveContext(message, languageName, languageCode);

  if (!apiKey) {
    return fallbackAnswer(message, languageName, languageCode);
  }

  const response = await fetch(FEATHERLESS_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            "You are LangSafe Linguist, a concise technical assistant for endangered-language preservation. Answer only from the provided archive context. Do not alter native-script terms or romanizations. When data is missing, say what would need live pipeline credentials. Include source/provenance language only for archive sources, not project history.",
        },
        {
          role: "user",
          content: JSON.stringify({
            question: message,
            context,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[agent-chat] Featherless error ${response.status}: ${body}`);
    return fallbackAnswer(message, languageName, languageCode);
  }

  const data = (await response.json()) as FeatherlessChatResponse;
  const answer = data.choices?.[0]?.message?.content?.trim() || fallbackAnswer(message, languageName, languageCode);
  return sanitizeArchiveTerms(answer, context);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeArchiveTerms(answer: string, context: ReturnType<typeof buildArchiveContext>) {
  let safeAnswer = answer;

  for (const entry of context.vocabulary) {
    if (!entry.romanized) continue;
    const romanized = escapeRegex(entry.romanized);
    safeAnswer = safeAnswer.replace(
      new RegExp(`(?:[\\p{Script=Hangul}\\w-]+)\\s*\\(${romanized}\\)`, "gu"),
      `${entry.term} (${entry.romanized})`
    );
  }

  return safeAnswer;
}

export async function POST(request: NextRequest) {
  const { message, conversation_id, language_code, language_name } = (await request
    .json()
    .catch(() => ({}))) as {
    message?: string;
    conversation_id?: string;
    language_code?: string;
    language_name?: string;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const conversationId = conversation_id || randomUUID();

      const write = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        write("conversation_id_set", { conversation_id: conversationId });
        write("reasoning", {
          reasoning: "Grounding the answer in LangSafe archive data and Featherless.ai.",
        });

        const answer = await askFeatherless(message, language_name, language_code);

        for (const chunk of chunkText(answer)) {
          write("message_chunk", { text_chunk: chunk });
        }
        write("message_complete", { message_content: answer });
        write("round_complete", {});
      } catch (error) {
        console.error("[agent-chat] Error:", error);
        const answer = fallbackAnswer(message, language_name, language_code);
        for (const chunk of chunkText(answer)) {
          write("message_chunk", { text_chunk: chunk });
        }
        write("message_complete", { message_content: answer });
        write("round_complete", {});
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
