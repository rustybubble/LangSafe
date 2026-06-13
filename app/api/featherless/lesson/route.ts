import { NextRequest, NextResponse } from "next/server";

const FEATHERLESS_CHAT_URL = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

type LessonPack = {
  provider: "featherless" | "demo";
  model: string;
  title: string;
  summary: string;
  activities: string[];
  oralPrompt?: string;
  quickCheck?: string;
};

type VocabularyInput = {
  term: string;
  romanized?: string;
  definition: string;
  cluster?: string;
  sources?: number;
};

type LessonRequest = {
  theme: string;
  audience: string;
  includeQuiz: boolean;
  includeOralPrompt: boolean;
  vocabulary: VocabularyInput[];
  grammarPattern: {
    title: string;
    description: string;
  };
};

type FeatherlessChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string | undefined = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback ?? "";
}

function normalizeRequest(raw: unknown): LessonRequest {
  const record = isRecord(raw) ? raw : {};
  const rawVocabulary = Array.isArray(record.vocabulary) ? record.vocabulary : [];
  const grammar = isRecord(record.grammarPattern) ? record.grammarPattern : {};

  return {
    theme: asString(record.theme, "archive"),
    audience: asString(record.audience, "community"),
    includeQuiz: record.includeQuiz !== false,
    includeOralPrompt: record.includeOralPrompt !== false,
    vocabulary: rawVocabulary
      .filter(isRecord)
      .slice(0, 8)
      .map((item) => ({
        term: asString(item.term, "archive term"),
        romanized: asString(item.romanized),
        definition: asString(item.definition, "Community-reviewed archive term"),
        cluster: asString(item.cluster),
        sources:
          typeof item.sources === "number" && Number.isFinite(item.sources)
            ? item.sources
            : undefined,
      })),
    grammarPattern: {
      title: asString(grammar.title, "Archive grammar pattern"),
      description: asString(
        grammar.description,
        "A verified grammar pattern from the archive."
      ),
    },
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFallbackLesson(input: LessonRequest): LessonPack {
  const first = input.vocabulary[0]?.term ?? "the first archive term";
  const second = input.vocabulary[1]?.term;
  const theme = titleCase(input.theme);
  const audience = titleCase(input.audience.replace(/-/g, " "));

  return {
    provider: "demo",
    model: "Bundled LangSafe lesson generator",
    title: `${theme} Starter Pack`,
    summary: `${audience} lesson plan built from ${input.vocabulary.length} verified archive terms and one grammar pattern.`,
    activities: [
      `Introduce ${first} with its meaning, pronunciation notes, and source count.`,
      "Ask learners to group related terms by cultural context before translating.",
      `Practice the archive grammar focus: ${input.grammarPattern.title}.`,
    ],
    oralPrompt: input.includeOralPrompt
      ? `Invite an elder or speaker to share a memory involving ${first}${
          second ? ` or ${second}` : ""
        }, then mark consent, dialect, and access notes.`
      : undefined,
    quickCheck: input.includeQuiz
      ? "Match each archive term to its meaning, then write one original sentence using the grammar focus."
      : undefined,
  };
}

function parseLessonJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(fenced.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function mergeFeatherlessLesson(
  parsed: Record<string, unknown>,
  fallback: LessonPack,
  model: string
): LessonPack {
  const activities = asStringArray(parsed.activities);

  return {
    provider: "featherless",
    model,
    title: asString(parsed.title, fallback.title),
    summary: asString(parsed.summary, fallback.summary),
    activities: activities.length ? activities : fallback.activities,
    oralPrompt: asString(parsed.oralPrompt, fallback.oralPrompt),
    quickCheck: asString(parsed.quickCheck, fallback.quickCheck),
  };
}

export async function POST(request: NextRequest) {
  const input = normalizeRequest(await request.json().catch(() => ({})));
  const fallback = buildFallbackLesson(input);
  const apiKey = process.env.FEATHERLESS_API_KEY;
  const model = process.env.FEATHERLESS_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json({ lesson: fallback });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch(FEATHERLESS_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 550,
        messages: [
          {
            role: "system",
            content:
              "You create community-safe endangered-language lesson packs. Use only the provided vocabulary and grammar facts. Do not invent translations. Return compact JSON only with title, summary, activities, oralPrompt, and quickCheck. Keep it under 140 words.",
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[featherless] ${response.status}: ${body}`);
      return NextResponse.json({ lesson: fallback });
    }

    const data = (await response.json()) as FeatherlessChatResponse;
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseLessonJson(content);

    if (!parsed) {
      console.error("[featherless] Model response did not contain JSON");
      return NextResponse.json({ lesson: fallback });
    }

    return NextResponse.json({
      lesson: mergeFeatherlessLesson(parsed, fallback, model),
    });
  } catch (error) {
    console.error("[featherless] Lesson generation failed:", error);
    return NextResponse.json({ lesson: fallback });
  } finally {
    clearTimeout(timeout);
  }
}
