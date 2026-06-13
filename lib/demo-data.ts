import { MOCK_GRAPH_DATA, MOCK_SEARCH_RESULTS, MOCK_STATS } from "@/lib/mock-events";
import type {
  GrammarCategory,
  GrammarPattern,
  LanguageBrowserResponse,
  LanguageEntry,
  LanguageFilters,
  LanguageOverview,
  PipelineRunArtifact,
  SignificantTermsResult,
  SourceInfo,
  VocabularyEntry,
} from "@/lib/types";

const DEMO_LANGUAGE_CODE = "jje";

export const DEMO_LANGUAGES_RESPONSE: LanguageBrowserResponse = {
  languages: [
    {
      glottocode: "jeju1234",
      name: "Jejueo",
      iso_code: "jje",
      alternate_names: ["제주어", "Jeju language"],
      macroarea: "Eurasia",
      latitude: 33.38,
      longitude: 126.56,
      language_family: "Koreanic",
      endangerment_status: "critically_endangered",
      endangerment_level: 5,
      speaker_count: 5000,
      countries: ["KR"],
      contact_languages: ["Korean", "Japanese", "English"],
      preservation_status: {
        sources_discovered: 10,
        vocabulary_entries: 4214,
        audio_clips: 266,
        last_pipeline_run: "2026-06-13T15:15:00Z",
        coverage_percentage: 21.1,
      },
    },
    {
      glottocode: "ainu1240",
      name: "Ainu",
      iso_code: "ain",
      alternate_names: ["アイヌ・イタㇰ", "Ainu itak"],
      macroarea: "Eurasia",
      latitude: 42.98,
      longitude: 141.35,
      language_family: "Ainu",
      endangerment_status: "critically_endangered",
      endangerment_level: 5,
      speaker_count: 10,
      countries: ["JP"],
      contact_languages: ["Japanese", "Russian"],
      preservation_status: {
        sources_discovered: 2,
        vocabulary_entries: 84,
        audio_clips: 12,
        last_pipeline_run: null,
        coverage_percentage: 0.4,
      },
    },
    {
      glottocode: "yaga1256",
      name: "Yagán",
      iso_code: "yag",
      alternate_names: ["Yámana"],
      macroarea: "South America",
      latitude: -54.93,
      longitude: -68.58,
      language_family: "Yaghan",
      endangerment_status: "critically_endangered",
      endangerment_level: 5,
      speaker_count: 1,
      countries: ["CL"],
      contact_languages: ["Spanish"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
    {
      glottocode: "live1238",
      name: "Livonian",
      iso_code: "liv",
      alternate_names: ["Livvi"],
      macroarea: "Eurasia",
      latitude: 57.57,
      longitude: 22.07,
      language_family: "Uralic",
      endangerment_status: "critically_endangered",
      endangerment_level: 5,
      speaker_count: 20,
      countries: ["LV"],
      contact_languages: ["Latvian", "Estonian"],
      preservation_status: {
        sources_discovered: 1,
        vocabulary_entries: 32,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0.2,
      },
    },
    {
      glottocode: "hawa1245",
      name: "Hawaiian",
      iso_code: "haw",
      alternate_names: ["ʻŌlelo Hawaiʻi"],
      macroarea: "Papunesia",
      latitude: 20.0,
      longitude: -156.32,
      language_family: "Austronesian",
      endangerment_status: "severely_endangered",
      endangerment_level: 4,
      speaker_count: 2000,
      countries: ["US"],
      contact_languages: ["English"],
      preservation_status: {
        sources_discovered: 3,
        vocabulary_entries: 120,
        audio_clips: 45,
        last_pipeline_run: null,
        coverage_percentage: 0.6,
      },
    },
    {
      glottocode: "cher1273",
      name: "Cherokee",
      iso_code: "chr",
      alternate_names: ["ᏣᎳᎩ", "Tsalagi"],
      macroarea: "North America",
      latitude: 35.47,
      longitude: -83.32,
      language_family: "Iroquoian",
      endangerment_status: "severely_endangered",
      endangerment_level: 4,
      speaker_count: 2100,
      countries: ["US"],
      contact_languages: ["English"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
    {
      glottocode: "maor1246",
      name: "Māori",
      iso_code: "mri",
      alternate_names: ["Te reo Māori"],
      macroarea: "Papunesia",
      latitude: -38.14,
      longitude: 176.24,
      language_family: "Austronesian",
      endangerment_status: "definitely_endangered",
      endangerment_level: 3,
      speaker_count: 50000,
      countries: ["NZ"],
      contact_languages: ["English"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
    {
      glottocode: "okin1246",
      name: "Okinawan",
      iso_code: "ryu",
      alternate_names: ["Uchinaaguchi"],
      macroarea: "Eurasia",
      latitude: 26.33,
      longitude: 127.77,
      language_family: "Japonic",
      endangerment_status: "definitely_endangered",
      endangerment_level: 3,
      speaker_count: 980000,
      countries: ["JP"],
      contact_languages: ["Japanese"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
    {
      glottocode: "arom1237",
      name: "Aromanian",
      iso_code: "rup",
      macroarea: "Eurasia",
      latitude: 40.65,
      longitude: 21.6,
      language_family: "Indo-European",
      endangerment_status: "definitely_endangered",
      endangerment_level: 3,
      speaker_count: 250000,
      countries: ["RO", "GR", "AL", "MK"],
      contact_languages: ["Romanian", "Greek", "Albanian"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
    {
      glottocode: "quec1387",
      name: "Quechua",
      iso_code: "que",
      macroarea: "South America",
      latitude: -13.52,
      longitude: -71.97,
      language_family: "Quechuan",
      endangerment_status: "vulnerable",
      endangerment_level: 2,
      speaker_count: 7000000,
      countries: ["PE", "BO", "EC"],
      contact_languages: ["Spanish"],
      preservation_status: {
        sources_discovered: 0,
        vocabulary_entries: 0,
        audio_clips: 0,
        last_pipeline_run: null,
        coverage_percentage: 0,
      },
    },
  ],
  total: 3142,
  stats: {
    total_endangered: 3142,
    critically_endangered: 577,
    extinct: 348,
    with_preservation_data: 4,
  },
};

export const DEMO_GRAMMAR_PATTERNS: GrammarPattern[] = [
  {
    id: "grammar-001",
    title: "Progressive action with -엄/-암",
    title_native: "-엄/-암",
    category: "verb_conjugation",
    description:
      "Jejueo marks ongoing action with progressive endings that differ from Standard Korean -고 있다, preserving a compact aspect distinction useful in oral narration.",
    rule: "verb stem + 엄/암 + auxiliary ending",
    examples: [
      {
        target: "해녀들이 물질헴수다",
        contact: "해녀들이 물질하고 있습니다",
        english: "The haenyeo are diving.",
        annotation: "Progressive marker attached to 물질하다.",
      },
      {
        target: "비가 오람수다",
        contact: "비가 오고 있습니다",
        english: "It is raining.",
      },
    ],
    related_vocabulary: ["물질", "해녀", "오다"],
    differences_from_contact:
      "Standard Korean typically uses a periphrastic construction, while Jejueo encodes progressive aspect in a shorter verbal ending.",
    source_urls: [
      "https://doi.org/10.1515/jsall-2019-2006",
      "https://ko.wikipedia.org/wiki/제주어",
    ],
    confidence: "high",
    created_at: "2026-06-13T15:12:00Z",
  },
  {
    id: "grammar-002",
    title: "Polite question ending -우꽈",
    title_native: "-우꽈",
    category: "question_formation",
    description:
      "A distinctive Jejueo interrogative ending used in polite questions, especially in service encounters and elder-directed conversation.",
    rule: "predicate stem + 우꽈",
    examples: [
      {
        target: "어디 감수꽈?",
        contact: "어디 가십니까?",
        english: "Where are you going?",
      },
      {
        target: "집이 어디우꽈?",
        contact: "집이 어디입니까?",
        english: "Where is the house?",
      },
    ],
    related_vocabulary: ["집", "가다", "어디"],
    source_urls: [
      "https://talkingdictionary.swarthmore.edu/jejueo/",
      "https://www.jeju.go.kr/culture/dialect/",
    ],
    confidence: "high",
    created_at: "2026-06-13T15:14:00Z",
  },
  {
    id: "grammar-003",
    title: "Connective -엉 for sequential action",
    title_native: "-엉",
    category: "sentence_structure",
    description:
      "The connective -엉 links actions in sequence, often corresponding to Standard Korean -고 or -어서 depending on context.",
    rule: "verb stem + 엉 + following clause",
    examples: [
      {
        target: "밥 먹엉 가라",
        contact: "밥 먹고 가라",
        english: "Eat your meal before you go.",
      },
      {
        target: "바당에 강 갯것 잡앙 온다",
        contact: "바다에 가서 해산물을 잡아 온다",
        english: "They go to the sea and bring back seafood.",
      },
    ],
    related_vocabulary: ["먹다", "바당", "갯것"],
    differences_from_contact:
      "Jejueo uses the connective heavily in oral storytelling, which helps preserve event order in field transcripts.",
    source_urls: [
      "https://www2.hawaii.edu/~chin/jejueo/",
      "https://elar.soas.ac.uk/Collection/MPI1032013",
    ],
    confidence: "medium",
    created_at: "2026-06-13T15:17:00Z",
  },
  {
    id: "grammar-004",
    title: "Sacred kinship titles in mythology",
    category: "honorific_system",
    description:
      "Kinship terms like 할망 can function as ordinary family words and sacred titles for female deities in Jeju mythological narratives.",
    examples: [
      {
        target: "설문대할망 이야기",
        contact: "설문대할망 이야기",
        english: "The story of Seolmundae Halmang.",
        annotation: "할망 marks a revered female ancestral or divine figure.",
      },
    ],
    related_vocabulary: ["할망", "설문대할망", "하르방"],
    source_urls: ["https://elar.soas.ac.uk/Collection/MPI1032013", "https://jejueo.org"],
    confidence: "medium",
    created_at: "2026-06-13T15:19:00Z",
  },
];

export const DEMO_SIGNIFICANT_TERMS: SignificantTermsResult = {
  clusters: [
    { key: "maritime", doc_count: 5, score: 9.7, bg_count: 48 },
    { key: "kinship", doc_count: 2, score: 6.8, bg_count: 63 },
    { key: "agriculture", doc_count: 1, score: 4.1, bg_count: 89 },
  ],
  pos: [
    { key: "noun", doc_count: 7, score: 8.4, bg_count: 2800 },
    { key: "verb", doc_count: 1, score: 3.2, bg_count: 900 },
  ],
  terms: [
    { key: "haenyeo", doc_count: 2, score: 7.1, bg_count: 14 },
    { key: "badang", doc_count: 1, score: 6.3, bg_count: 19 },
    { key: "muljil", doc_count: 1, score: 5.9, bg_count: 11 },
  ],
};

export const DEMO_SOURCES: SourceInfo[] = [
  {
    url: "https://www2.hawaii.edu/~chin/jejueo/",
    title: "University of Hawaii Jejueo Dictionary",
    type: "dictionary",
    entry_count: 847,
    grammar_count: 3,
    status: "extracted",
  },
  {
    url: "https://talkingdictionary.swarthmore.edu/jejueo/",
    title: "Jejueo Talking Dictionary",
    type: "dictionary",
    entry_count: 312,
    grammar_count: 1,
    status: "extracted",
  },
  {
    url: "https://elar.soas.ac.uk/Collection/MPI1032013",
    title: "ELAR Jejueo Field Recordings",
    type: "archive",
    entry_count: 489,
    grammar_count: 8,
    status: "extracted",
  },
  {
    url: "https://youtube.com/@jejueo-saturi",
    title: "Jejueo Saturi Conversation Videos",
    type: "video",
    entry_count: 204,
    grammar_count: 5,
    status: "extracted",
  },
  {
    url: "https://doi.org/10.1515/jsall-2019-2006",
    title: "Yang (2019), Jejueo Clause Structure",
    type: "academic",
    entry_count: 34,
    grammar_count: 12,
    status: "extracted",
  },
];

export const DEMO_PIPELINE_RUNS: PipelineRunArtifact[] = [
  {
    id: "linghacks-demo-jejueo",
    language_code: DEMO_LANGUAGE_CODE,
    language_name: "Jejueo",
    glottocode: "jeju1234",
    started_at: "2026-06-13T15:02:14Z",
    completed_at: "2026-06-13T15:11:48Z",
    duration_seconds: 574,
    status: "completed",
    stats: {
      sources_discovered: 10,
      sources_completed: 9,
      sources_failed: 1,
      sources_skipped: 2,
      entries_extracted: 4214,
      grammar_patterns: 58,
      audio_clips: 266,
      cross_references: 1847,
    },
    sources: DEMO_SOURCES.map((source) => ({
      url: source.url,
      title: source.title,
      type: source.type,
      status: source.status ?? "extracted",
      entry_count: source.entry_count,
      grammar_count: source.grammar_count,
      audio_count: source.type === "video" || source.type === "archive" ? 23 : 0,
    })),
  },
];

export const DEMO_OVERVIEWS: Record<string, LanguageOverview> = {
  jeju1234: {
    summary:
      "Jejueo is the traditional language of Jeju Island, distinct from Standard Korean in vocabulary, phonology, morphology, and discourse style. It is classified as critically endangered because fluent everyday use is concentrated among older speakers, while younger generations often understand only fragments.\n\nFor LingHacks VII, LangSafe uses Jejueo as a live demo language because its sources show the full preservation problem: academic grammars, government dictionaries, oral-history archives, talking dictionaries, and community videos all contain different pieces of the same linguistic picture.",
    linguistic_features: {
      writing_system:
        "Hangul is commonly used, with romanization appearing in academic and learner materials.",
      phonology:
        "Distinctive vowel contrasts and sound correspondences separate Jejueo from Standard Korean.",
      word_order: "SOV, with rich verbal endings and discourse particles.",
      morphological_type: "Agglutinative, with aspect, politeness, and connective endings.",
      notable_features: [
        "Maritime vocabulary tied to haenyeo culture.",
        "Kinship terms with sacred and everyday meanings.",
        "Question and progressive endings that differ from Standard Korean.",
        "Sub-dialect variation across Jeju villages.",
      ],
    },
    demographics: {
      speaker_count_detail:
        "Often estimated at fewer than 5,000 fluent speakers, mostly older adults.",
      age_distribution:
        "Fluency is strongest among elders; revitalization efforts focus on children and families.",
      geographic_distribution:
        "Jeju Island, South Korea, with diaspora learners and researchers online.",
      revitalization_efforts:
        "Community societies, dictionaries, recordings, school materials, and online lessons.",
    },
    external_links: [
      {
        url: "https://glottolog.org/resource/languoid/id/jeju1234",
        title: "Glottolog: Jejueo",
        type: "glottolog",
      },
      {
        url: "https://talkingdictionary.swarthmore.edu/jejueo/",
        title: "Jejueo Talking Dictionary",
        type: "other",
      },
      {
        url: "https://elar.soas.ac.uk/Collection/MPI1032013",
        title: "ELAR Jejueo Collection",
        type: "elar",
      },
    ],
    generated_at: "2026-06-13T15:15:00Z",
  },
};

export function filterDemoLanguages(filters: LanguageFilters = {}): LanguageBrowserResponse {
  let languages = [...DEMO_LANGUAGES_RESPONSE.languages];

  if (filters.search) {
    const q = filters.search.toLowerCase();
    languages = languages.filter((lang) => {
      return [
        lang.name,
        lang.iso_code,
        lang.glottocode,
        lang.language_family,
        lang.macroarea,
        ...(lang.alternate_names ?? []),
        ...(lang.contact_languages ?? []),
        ...lang.countries,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    });
  }

  if (filters.endangerment?.length) {
    languages = languages.filter((lang) =>
      filters.endangerment!.includes(lang.endangerment_status)
    );
  }

  if (filters.macroarea?.length) {
    languages = languages.filter((lang) => filters.macroarea!.includes(lang.macroarea));
  }

  if (filters.family) {
    const family = filters.family.toLowerCase();
    languages = languages.filter((lang) =>
      lang.language_family.toLowerCase().includes(family)
    );
  }

  if (filters.min_speakers != null) {
    languages = languages.filter(
      (lang) => lang.speaker_count != null && lang.speaker_count >= filters.min_speakers!
    );
  }

  if (filters.max_speakers != null) {
    languages = languages.filter(
      (lang) => lang.speaker_count != null && lang.speaker_count <= filters.max_speakers!
    );
  }

  if (filters.has_preservation != null) {
    languages = languages.filter((lang) =>
      filters.has_preservation
        ? lang.preservation_status.vocabulary_entries > 0
        : lang.preservation_status.vocabulary_entries === 0
    );
  }

  if (filters.sort === "speakers_asc") {
    languages.sort((a, b) => (a.speaker_count ?? Infinity) - (b.speaker_count ?? Infinity));
  } else if (filters.sort === "speakers_desc") {
    languages.sort((a, b) => (b.speaker_count ?? -1) - (a.speaker_count ?? -1));
  } else if (filters.sort === "endangerment") {
    languages.sort((a, b) => b.endangerment_level - a.endangerment_level);
  }

  const total = languages.length;
  const page = Math.max(filters.page ?? 1, 1);
  const limit = filters.limit ?? total;
  const start = (page - 1) * limit;

  return {
    languages: languages.slice(start, start + limit),
    total,
    stats: DEMO_LANGUAGES_RESPONSE.stats,
  };
}

export function getDemoLanguage(glottocode: string): LanguageEntry | null {
  return (
    DEMO_LANGUAGES_RESPONSE.languages.find(
      (language) => language.glottocode === glottocode
    ) ?? null
  );
}

function entryMatchesQuery(entry: VocabularyEntry, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    entry.headword_native,
    entry.headword_romanized,
    entry.pos,
    entry.semantic_cluster,
    entry.ipa,
    entry.grammar_notes,
    entry.cultural_context,
    ...entry.related_terms,
    ...entry.definitions.map((definition) => definition.text),
    ...entry.example_sentences.flatMap((example) => [
      example.target,
      example.contact,
      example.english,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function searchDemoVocabulary(
  query = "",
  options: {
    limit?: number;
    offset?: number;
    language_code?: string;
    cluster?: string;
    source_url?: string;
  } = {}
): { entries: VocabularyEntry[]; total: number } {
  const { limit = 20, offset = 0, language_code, cluster, source_url } = options;

  if (language_code && language_code !== DEMO_LANGUAGE_CODE) {
    return { entries: [], total: 0 };
  }

  let entries = MOCK_SEARCH_RESULTS;

  if (source_url) {
    entries = entries.filter((entry) =>
      entry.cross_references.some((ref) => ref.source_url === source_url)
    );
  }

  if (cluster && cluster !== "all") {
    entries = entries.filter((entry) => entry.semantic_cluster === cluster);
  }

  entries = entries.filter((entry) => entryMatchesQuery(entry, query));

  return {
    entries: entries.slice(offset, offset + limit),
    total: entries.length,
  };
}

function grammarMatchesQuery(pattern: GrammarPattern, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    pattern.title,
    pattern.title_native,
    pattern.category,
    pattern.description,
    pattern.rule,
    pattern.differences_from_contact,
    ...pattern.related_vocabulary,
    ...pattern.examples.flatMap((example) => [
      example.target,
      example.contact,
      example.english,
      example.annotation,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function searchDemoGrammar(
  query = "",
  options: {
    category?: GrammarCategory;
    limit?: number;
    offset?: number;
    language_code?: string;
  } = {}
): { patterns: GrammarPattern[]; total: number } {
  const { category, limit = 20, offset = 0, language_code } = options;

  if (language_code && language_code !== DEMO_LANGUAGE_CODE) {
    return { patterns: [], total: 0 };
  }

  let patterns = DEMO_GRAMMAR_PATTERNS;
  if (category) {
    patterns = patterns.filter((pattern) => pattern.category === category);
  }
  patterns = patterns.filter((pattern) => grammarMatchesQuery(pattern, query));

  return {
    patterns: patterns.slice(offset, offset + limit),
    total: patterns.length,
  };
}

export function getDemoGrammarStats(): {
  total: number;
  by_category: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  for (const pattern of DEMO_GRAMMAR_PATTERNS) {
    byCategory[pattern.category] = (byCategory[pattern.category] ?? 0) + 1;
  }
  return {
    total: DEMO_GRAMMAR_PATTERNS.length,
    by_category: byCategory,
  };
}

export function getDemoGraphData(cluster?: string, headword?: string) {
  let nodes = MOCK_GRAPH_DATA.nodes;
  let edges = MOCK_GRAPH_DATA.edges;

  if (cluster && cluster !== "all") {
    const nodeIds = new Set(
      nodes.filter((node) => node.cluster === cluster).map((node) => node.id)
    );
    nodes = nodes.filter((node) => nodeIds.has(node.id));
    edges = edges.filter((edge) => {
      const source = typeof edge.source === "string" ? edge.source : String(edge.source);
      const target = typeof edge.target === "string" ? edge.target : String(edge.target);
      return nodeIds.has(source) && nodeIds.has(target);
    });
  }

  if (headword) {
    const match = nodes.find(
      (node) =>
        node.headword.toLowerCase() === headword.toLowerCase() ||
        node.romanization?.toLowerCase() === headword.toLowerCase()
    );
    if (match) {
      const neighborIds = new Set([match.id]);
      for (const edge of edges) {
        const source = typeof edge.source === "string" ? edge.source : String(edge.source);
        const target = typeof edge.target === "string" ? edge.target : String(edge.target);
        if (source === match.id) neighborIds.add(target);
        if (target === match.id) neighborIds.add(source);
      }
      nodes = nodes.filter((node) => neighborIds.has(node.id));
      edges = edges.filter((edge) => {
        const source = typeof edge.source === "string" ? edge.source : String(edge.source);
        const target = typeof edge.target === "string" ? edge.target : String(edge.target);
        return neighborIds.has(source) && neighborIds.has(target);
      });
    }
  }

  return { nodes, edges, total: nodes.length };
}

export function getDemoOverview(glottocode: string): LanguageOverview | null {
  return DEMO_OVERVIEWS[glottocode] ?? null;
}

export function getDemoStats() {
  return MOCK_STATS;
}

export function getDemoPipelineRuns(languageCode: string): PipelineRunArtifact[] {
  if (languageCode && languageCode !== DEMO_LANGUAGE_CODE) return [];
  return DEMO_PIPELINE_RUNS;
}
