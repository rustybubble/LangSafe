import type { LanguageEntry, LanguageOverview, ExternalLinkType } from "../types";
import { ENDANGERMENT_LABELS } from "../types";
import { featherlessChatText, extractJson } from "./featherless";

const OVERVIEW_MAX_TOKENS = 4096;

const OVERVIEW_SYSTEM_PROMPT = `You are a careful linguist writing concise endangered-language profiles for LangSafe.

Return ONLY valid JSON matching this TypeScript shape:
{
  "summary": "2-3 paragraphs grounded in the supplied metadata and clearly marked uncertainties",
  "linguistic_features": {
    "writing_system": "string if known",
    "phonology": "string if known",
    "word_order": "string if known",
    "morphological_type": "string if known",
    "notable_features": ["short feature strings"]
  },
  "demographics": {
    "speaker_count_detail": "string if known",
    "age_distribution": "string if known",
    "geographic_distribution": "string if known",
    "revitalization_efforts": "string if known"
  },
  "external_links": [
    { "url": "https://...", "title": "string", "type": "wikipedia|glottolog|elp|elar|ethnologue|other" }
  ]
}

Do not fabricate precise facts. If the supplied metadata is incomplete, say what is unknown instead of inventing details.`;

function buildOverviewPrompt(language: LanguageEntry): string {
  const parts = [
    `Language: ${language.name}`,
    `ISO 639-3 code: ${language.iso_code || "unknown"}`,
    `Glottocode: ${language.glottocode}`,
    `Language family: ${language.language_family || "unknown"}`,
    `Macroarea: ${language.macroarea || "unknown"}`,
    `Endangerment status: ${ENDANGERMENT_LABELS[language.endangerment_status] || language.endangerment_status}`,
  ];

  if (language.countries?.length) {
    parts.push(`Countries: ${language.countries.join(", ")}`);
  }
  if (language.speaker_count != null) {
    parts.push(
      `Estimated speakers: ${language.speaker_count === 0 ? "No living speakers listed" : `about ${language.speaker_count.toLocaleString()}`}`
    );
  }
  if (language.alternate_names?.length) {
    parts.push(`Alternate names: ${language.alternate_names.slice(0, 8).join(", ")}`);
  }

  parts.push(
    "\nCreate an overview suitable for a language detail page. Include likely reference links only for stable public catalog/search pages when exact article URLs are not guaranteed."
  );

  return parts.join("\n");
}

function normalizeLinkType(type: unknown): ExternalLinkType {
  const raw = String(type || "other");
  return ["wikipedia", "glottolog", "elp", "elar", "ethnologue", "other"].includes(raw)
    ? raw as ExternalLinkType
    : "other";
}

function normalizeOverview(raw: unknown): Omit<LanguageOverview, "generated_at"> {
  const value = raw as Record<string, any>;
  const features = value.linguistic_features || {};
  const demographics = value.demographics || {};
  const links = Array.isArray(value.external_links) ? value.external_links : [];

  return {
    summary: String(value.summary || "No overview is available yet."),
    linguistic_features: {
      writing_system: features.writing_system ? String(features.writing_system) : undefined,
      phonology: features.phonology ? String(features.phonology) : undefined,
      word_order: features.word_order ? String(features.word_order) : undefined,
      morphological_type: features.morphological_type ? String(features.morphological_type) : undefined,
      notable_features: Array.isArray(features.notable_features)
        ? features.notable_features.map(String).filter(Boolean)
        : [],
    },
    demographics: {
      speaker_count_detail: demographics.speaker_count_detail ? String(demographics.speaker_count_detail) : undefined,
      age_distribution: demographics.age_distribution ? String(demographics.age_distribution) : undefined,
      geographic_distribution: demographics.geographic_distribution ? String(demographics.geographic_distribution) : undefined,
      revitalization_efforts: demographics.revitalization_efforts ? String(demographics.revitalization_efforts) : undefined,
    },
    external_links: links
      .map((link: Record<string, unknown>) => ({
        url: String(link.url || ""),
        title: String(link.title || link.url || ""),
        type: normalizeLinkType(link.type),
      }))
      .filter((link) => /^https?:\/\//i.test(link.url)),
  };
}

export async function generateLanguageOverview(
  language: LanguageEntry
): Promise<LanguageOverview> {
  const text = await featherlessChatText({
    system: OVERVIEW_SYSTEM_PROMPT,
    prompt: buildOverviewPrompt(language),
    maxTokens: OVERVIEW_MAX_TOKENS,
    temperature: 0.15,
  });

  const overview = normalizeOverview(extractJson(text));

  return {
    ...overview,
    generated_at: new Date().toISOString(),
  };
}
