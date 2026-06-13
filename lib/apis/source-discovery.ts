import type { SourceType, LanguageMetadata } from "../types";
import { kvGet, kvSet, cacheKeys, hashQuery, TTL } from "../kv-cache";
import { featherlessChatText, extractJson } from "./featherless";
import type { CitationReference } from "../utils/citations.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebDiscoverySource {
  url: string;
  title: string;
  description: string;
  source_type: SourceType;
}

export interface WebDiscoveryResult {
  sources: WebDiscoverySource[];
  raw_text: string;
  citations: string[];
  citation_references: CitationReference[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TOKENS = 2048;
const TIMEOUT_MS = 20_000;

/** Noise domains to exclude from model-planned discovery passes. */
export const DOMAIN_DENYLIST = [
  "-facebook.com",
  "-instagram.com",
  "-pinterest.com",
  "-tiktok.com",
  "-twitter.com",
  "-x.com",
  "-amazon.com",
  "-ebay.com",
  "-etsy.com",
  "-quora.com",
];

/** Trusted linguistic/academic domains for focused preservation queries. */
export const ACADEMIC_DOMAIN_ALLOWLIST = [
  "glottolog.org",
  "endangeredlanguages.com",
  "elararchive.org",
  "livingtongues.org",
  "aclanthology.org",
  "researchgate.net",
  "academia.edu",
  "jstor.org",
  "scholar.google.com",
  "en.wikipedia.org",
  "en.wiktionary.org",
  "scholarspace.manoa.hawaii.edu",
  "catalog.paradisec.org.au",
  "pangloss.cnrs.fr",
  "ailla.utexas.org",
  "wikitongues.org",
];

const SYSTEM_MESSAGE = `You are a preservation-source planning assistant for endangered-language documentation.

Given a query, return specific candidate URLs that are likely to contain dictionaries, word lists, grammar sketches, audio/video recordings, archives, or community learning material.

Rules:
- Prefer stable public sources: university archives, Glottolog, Endangered Languages Project, ELAR, PARADISEC, AILLA, Wikipedia/Wiktionary, Wikitongues, talking dictionaries, and official community projects.
- Do not invent obviously fake domains.
- Return ONLY a JSON array. Each object must contain url, title, and description.
- Keep the list compact: 3 to 8 candidates.`;

// ─── Source type classification ──────────────────────────────────────────────

export function classifySourceType(url: string, description: string): SourceType {
  const combined = `${url} ${description}`.toLowerCase();
  if (/dictionary|dict|wiktionary|word.?list|lexicon/.test(combined)) return "dictionary";
  if (/scholar|academic|journal|paper|arxiv|research|thesis|phonolog/.test(combined)) return "academic";
  if (/youtube|video|vimeo|lesson/.test(combined)) return "video";
  if (/archive\.org|museum|collection|oral.?history|recording/.test(combined)) return "archive";
  if (/wiki/.test(combined)) return "wiki";
  return "archive";
}

function blockedByDomainFilter(url: string, domainFilter?: string[]): boolean {
  if (!domainFilter?.length) return false;
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  return domainFilter.some((domain) => {
    if (!domain.startsWith("-")) return false;
    return host.includes(domain.slice(1).toLowerCase());
  });
}

function normalizeSource(raw: unknown): WebDiscoverySource | null {
  const item = raw as Record<string, unknown>;
  const url = String(item.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const title = String(item.title || url).trim();
  const description = String(item.description || "").trim();
  return {
    url,
    title,
    description,
    source_type: classifySourceType(url, description),
  };
}

function inferLanguageName(query: string): string {
  const languageMatch = query.match(/([A-Z][\p{L}\p{M}' -]{1,60})\s+language/iu);
  if (languageMatch?.[1]) return languageMatch[1].trim();
  return query
    .replace(/\b(online|dictionary|word list|audio recordings|preservation resources|grammar|reference|documentation|OR)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function deterministicCandidates(query: string): WebDiscoverySource[] {
  const languageName = inferLanguageName(query);
  const wikiName = encodeURIComponent(`${languageName.replace(/\s+/g, "_")}_language`);
  const searchName = encodeURIComponent(languageName);

  const candidates = [
    {
      url: `https://en.wikipedia.org/wiki/${wikiName}`,
      title: `${languageName} language - Wikipedia`,
      description: "Reference article that may include classification, examples, external links, and preservation context.",
    },
    {
      url: `https://glottolog.org/glottolog?search=${searchName}`,
      title: `Glottolog search for ${languageName}`,
      description: "Linguistic catalog search page for identifying language metadata and references.",
    },
    {
      url: `https://www.endangeredlanguages.com/search?query=${searchName}`,
      title: `Endangered Languages Project search for ${languageName}`,
      description: "Preservation project search page for endangered-language metadata and community resources.",
    },
    {
      url: `https://elararchive.org/?s=${searchName}`,
      title: `ELAR archive search for ${languageName}`,
      description: "Archive search page for deposits, recordings, and documentation bundles.",
    },
    {
      url: `https://www.wiktionary.org/wiki/Special:Search?search=${searchName}`,
      title: `Wiktionary search for ${languageName}`,
      description: "Wiktionary search that may surface lexical entries or appendices.",
    },
  ];

  return candidates.map((source) => ({
    ...source,
    source_type: classifySourceType(source.url, source.description),
  }));
}

async function planSourcesWithFeatherless(
  query: string,
  signal?: AbortSignal
): Promise<{ rawText: string; sources: WebDiscoverySource[] }> {
  const rawText = await featherlessChatText({
    system: SYSTEM_MESSAGE,
    prompt: `Discovery query: ${query}`,
    maxTokens: MAX_TOKENS,
    temperature: 0.15,
    signal,
  });

  const parsed = extractJson<unknown[]>(rawText);
  const sources = parsed.map(normalizeSource).filter((s): s is WebDiscoverySource => !!s);
  return { rawText, sources };
}

// ─── Core provider-neutral discovery call ───────────────────────────────────

export async function searchLanguageSources(
  query: string,
  externalSignal?: AbortSignal,
  domainFilter?: string[]
): Promise<WebDiscoveryResult> {
  const qHash = hashQuery({ q: query, df: domainFilter?.sort().join(",") });
  const cacheKey = cacheKeys.discovery(qHash);
  const cached = await kvGet<WebDiscoveryResult>(cacheKey);
  if (cached) {
    console.log(`[SourceDiscovery] Cache hit for query: "${query.slice(0, 60)}..."`);
    return cached;
  }

  const fetchSignal = externalSignal
    ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), externalSignal])
    : AbortSignal.timeout(TIMEOUT_MS);

  const seen = new Set<string>();
  const sources: WebDiscoverySource[] = [];
  let rawText = "[]";

  const addSources = (items: WebDiscoverySource[]) => {
    for (const source of items) {
      if (seen.has(source.url)) continue;
      if (blockedByDomainFilter(source.url, domainFilter)) continue;
      seen.add(source.url);
      sources.push(source);
    }
  };

  addSources(deterministicCandidates(query));

  try {
    const planned = await planSourcesWithFeatherless(query, fetchSignal);
    rawText = planned.rawText;
    addSources(planned.sources);
  } catch (err) {
    console.warn(
      "[SourceDiscovery] Featherless planning failed, using deterministic sources:",
      err instanceof Error ? err.message : String(err)
    );
  }

  const result: WebDiscoveryResult = {
    sources,
    raw_text: rawText,
    citations: [],
    citation_references: [],
  };

  if (result.sources.length > 0) {
    kvSet(cacheKey, result, TTL.DISCOVERY);
  }

  return result;
}

// ─── Contact language search terms ──────────────────────────────────────────

interface ContactSearchTerms {
  dictionary: string;
  preservation: string;
}

const CONTACT_LANGUAGE_TERMS: Record<string, ContactSearchTerms> = {
  English: { dictionary: "dictionary", preservation: "language preservation" },
  Korean: { dictionary: "사전", preservation: "보전" },
  Japanese: { dictionary: "辞書", preservation: "言語保存" },
  Chinese: { dictionary: "词典", preservation: "语言保护" },
  "Mandarin Chinese": { dictionary: "词典", preservation: "语言保护" },
  Spanish: { dictionary: "diccionario", preservation: "preservación lengua" },
  Portuguese: { dictionary: "dicionário", preservation: "preservação língua" },
  French: { dictionary: "dictionnaire", preservation: "préservation langue" },
  Russian: { dictionary: "словарь", preservation: "сохранение языка" },
  Hindi: { dictionary: "शब्दकोश", preservation: "भाषा संरक्षण" },
  Indonesian: { dictionary: "kamus", preservation: "pelestarian bahasa" },
  Malay: { dictionary: "kamus", preservation: "pemuliharaan bahasa" },
  Arabic: { dictionary: "قاموس", preservation: "حفظ اللغة" },
  Thai: { dictionary: "พจนานุกรม", preservation: "การอนุรักษ์ภาษา" },
  Turkish: { dictionary: "sözlük", preservation: "dil koruma" },
  Swahili: { dictionary: "kamusi", preservation: "uhifadhi wa lugha" },
  Vietnamese: { dictionary: "từ điển", preservation: "bảo tồn ngôn ngữ" },
  Filipino: { dictionary: "diksyunaryo", preservation: "pagpapanatili ng wika" },
  Bengali: { dictionary: "অভিধান", preservation: "ভাষা সংরক্ষণ" },
  Tamil: { dictionary: "அகராதி", preservation: "மொழி பாதுகாப்பு" },
  Nepali: { dictionary: "शब्दकोश", preservation: "भाषा संरक्षण" },
  Burmese: { dictionary: "အဘိဓာန်", preservation: "ဘာသာစကား ထိန်းသိမ်းခြင်း" },
  Khmer: { dictionary: "វចនានុក្រម", preservation: "ការអភិរក្សភាសា" },
  Persian: { dictionary: "فرهنگ لغت", preservation: "حفظ زبان" },
  German: { dictionary: "Wörterbuch", preservation: "Spracherhaltung" },
  Dutch: { dictionary: "woordenboek", preservation: "taalbehoud" },
  Italian: { dictionary: "dizionario", preservation: "preservazione linguistica" },
  Urdu: { dictionary: "لغت", preservation: "زبان کا تحفظ" },
  Amharic: { dictionary: "መዝገበ ቃላት", preservation: "ቋንቋ ጥበቃ" },
  Hausa: { dictionary: "kamus", preservation: "kiyaye harshe" },
  Yoruba: { dictionary: "ìwé atúmọ̀", preservation: "ìtọ́jú èdè" },
  Zulu: { dictionary: "isichazamazwi", preservation: "ukulondoloza ulimi" },
};

function getContactLanguageSearchTerms(contactLang: string): ContactSearchTerms | null {
  return CONTACT_LANGUAGE_TERMS[contactLang]
    || CONTACT_LANGUAGE_TERMS[
      Object.keys(CONTACT_LANGUAGE_TERMS).find(
        (key) => key.toLowerCase() === contactLang.toLowerCase()
      ) || ""
    ]
    || null;
}

// ─── Query generation ───────────────────────────────────────────────────────

const MAX_SEED_QUERIES = 24;

export function generateSearchQueries(meta: LanguageMetadata): string[] {
  const lang = meta.language_name;
  const queries: string[] = [];

  queries.push(`${lang} online dictionary word list`);
  queries.push(`${lang} audio recordings oral history`);
  queries.push(`${lang} academic papers computational linguistics`);
  queries.push(`${lang} YouTube native speaker lessons`);
  queries.push(`${lang} endangered language archive preservation`);
  queries.push(`${lang} grammar reference documentation`);
  queries.push(`${lang} parallel corpus dataset NLP`);
  queries.push(`${lang} textbook PDF learning materials`);

  if (meta.native_name) {
    queries.push(`${meta.native_name} dictionary`);
    queries.push(`${meta.native_name} vocabulary`);
  }

  if (meta.alternate_names?.length) {
    for (const alt of meta.alternate_names.slice(0, 3)) {
      queries.push(`${alt} language dictionary word list`);
    }
  }

  if (meta.contact_languages?.length) {
    for (const contact of meta.contact_languages) {
      const terms = getContactLanguageSearchTerms(contact);
      if (terms) {
        const searchName = meta.native_name || lang;
        queries.push(`${searchName} ${terms.dictionary}`);
        queries.push(`${searchName} ${terms.preservation}`);
      }
    }
  }

  if (meta.countries?.length) {
    for (const country of meta.countries.slice(0, 2)) {
      queries.push(`${lang} language ${country} documentation`);
    }
  }

  if (meta.language_family) {
    queries.push(`${meta.language_family} family ${lang} comparative vocabulary`);
  }

  return queries.slice(0, MAX_SEED_QUERIES);
}
