export type AgentType = "discovery" | "extraction" | "cross_reference" | "pronunciation" | "orchestrator";
export type AgentStatus = "running" | "complete" | "error";
export type SourceType = "dictionary" | "academic" | "video" | "archive" | "wiki";
export type Language = string;

export interface AgentEvent {
  id: string;
  agent: AgentType;
  action: string;
  status: AgentStatus;
  data: {
    url?: string;
    title?: string;
    type?: SourceType;
    count?: number;
    message?: string;
    crawl_method?: string;
    brightdata_unlocked?: boolean;
    discovered_via?: string;
    // Stagehand observability
    crawl_strategy?: string;
    crawl_pages?: number;
    browserbase_url?: string;
    live_debug_url?: string;
  };
  timestamp: string;
}

export interface Definition {
  language: Language;
  text: string;
}

export interface ExampleSentence {
  target: string;
  contact?: string;
  english?: string;
  source_url?: string;
}

export interface CrossReference {
  source_title: string;
  source_url: string;
  source_type: string;
  definition?: string;
  notes?: string;
  reliability_score?: number;
}

export interface Conjugation {
  form: string;
  native: string;
  romanized: string;
  notes?: string;
}

export interface MorphologyInfo {
  root: string;
  root_romanized: string;
  affixes: string[];
  compound_parts?: string[];
  derivation_notes?: string;
}

export type UsageRegister = "formal" | "informal" | "archaic" | "dialectal" | "literary" | "colloquial";
export type UsageFrequency = "common" | "uncommon" | "rare";

export interface UsageInfo {
  register: UsageRegister;
  frequency?: UsageFrequency;
  age_group?: string;
  geographic_note?: string;
}

export type GrammarCategory =
  | "verb_conjugation"
  | "particle_usage"
  | "sentence_structure"
  | "honorific_system"
  | "negation"
  | "question_formation"
  | "phonological_rule"
  | "morphological_rule"
  | "other";

export interface GrammarExample {
  target: string;
  contact?: string;
  english?: string;
  annotation?: string;
}

export interface GrammarPattern {
  id: string;
  title: string;
  title_native?: string;
  category: GrammarCategory;
  description: string;
  rule?: string;
  examples: GrammarExample[];
  related_vocabulary: string[];
  differences_from_contact?: string;
  source_urls: string[];
  confidence: "high" | "medium" | "low";
  created_at: string;
}

export const GRAMMAR_CATEGORY_LABELS: Record<GrammarCategory, string> = {
  verb_conjugation: "Verb Conjugation",
  particle_usage: "Particle Usage",
  sentence_structure: "Sentence Structure",
  honorific_system: "Honorific System",
  negation: "Negation",
  question_formation: "Question Formation",
  phonological_rule: "Phonological Rule",
  morphological_rule: "Morphological Rule",
  other: "Other",
};

export interface VocabularyEntry {
  id: string;
  headword_native: string;
  headword_romanized?: string;
  pos: string;
  definitions: Definition[];
  example_sentences: ExampleSentence[];
  audio_url?: string;
  related_terms: string[];
  cross_references: CrossReference[];
  semantic_cluster?: string;
  ipa?: string;
  conjugations?: Conjugation[];
  morphology?: MorphologyInfo;
  usage?: UsageInfo;
  grammar_notes?: string;
  pronunciation_video_url?: string;
  cultural_context?: string;
  language_confidence?: "high" | "medium" | "low";
  source_count?: number;
}

export interface ElasticDocument extends VocabularyEntry {
  language_code: string;
  glottocode?: string;
  language_name?: string;
  embedding?: number[];
  created_at: string;
}

export interface SourcesByType {
  dictionary: number;
  academic: number;
  video: number;
  archive: number;
  wiki: number;
}

export interface LanguageStats {
  total_entries: number;
  total_sources: number;
  total_audio_clips: number;
  grammar_patterns: number;
  coverage_percentage: number;
  sources_by_type: SourcesByType;
}

// ── BrightData Impact Metrics ────────────────────────────────────────────────

export interface BrightDataMetrics {
  searches_geo_targeted: number;
  searches_total: number;
  scrapes_total: number;
  sources_discovered_via_serp_api: number;
  sources_unlocked: number;
  sources_unlocked_urls: string[];
  sources_crawled_via_web_unlocker: number;
  avg_crawl_duration_cheerio_ms: number;
  avg_crawl_duration_web_unlocker_ms: number;
  countries_searched: string[];
  content_unlocked_bytes: number;
  content_standard_bytes: number;
}

// ── Vocabulary Insights (significant_terms) ─────────────────────────────────

export interface SignificantTerm {
  key: string;
  doc_count: number;
  score: number;
  bg_count: number;
}

export interface SignificantTermsResult {
  clusters: SignificantTerm[];
  pos: SignificantTerm[];
  terms: SignificantTerm[];
}

export const AGENT_COLORS: Record<AgentType, string> = {
  discovery: "#1E40AF",
  extraction: "#047857",
  cross_reference: "#6D28D9",
  pronunciation: "#DC2626",
  orchestrator: "#2563EB",
};

export const AGENT_LABELS: Record<AgentType, string> = {
  discovery: "Discovery",
  extraction: "Extraction",
  cross_reference: "Cross-Reference",
  pronunciation: "Pronunciation",
  orchestrator: "Orchestrator",
};

export const SOURCE_TYPE_ICONS: Record<SourceType, string> = {
  dictionary: "BookOpen",
  academic: "GraduationCap",
  video: "Video",
  archive: "Archive",
  wiki: "Globe",
};

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface AudioSegment {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface AudioResult {
  video_url: string;
  video_id: string;
  transcript: string;
  corrected_transcript: string;
  audio_urls: string[];
  segments: AudioSegment[];
  duration_seconds: number;
  word_clips?: Record<string, string>;
}

export interface TranscriptData {
  transcript: string;
  corrected: string;
  segments: AudioSegment[];
  word_clips: Record<string, string>;
  audio_urls: string[];
  duration_seconds: number;
  language_name: string;
  video_url: string;
}

export interface PronunciationVideo {
  video_id: string;
  video_url: string;
  word: string;
  cached: boolean;
}

// ── Language Browser ────────────────────────────────────────────────────────

export type EndangermentStatus =
  | "not_endangered"
  | "vulnerable"
  | "definitely_endangered"
  | "severely_endangered"
  | "critically_endangered"
  | "extinct";

export interface PreservationStatus {
  sources_discovered: number;
  vocabulary_entries: number;
  audio_clips: number;
  last_pipeline_run: string | null;
  coverage_percentage: number;
}

export interface LanguageEntry {
  glottocode: string;
  name: string;
  iso_code: string;
  alternate_names?: string[];
  macroarea: string;
  latitude: number;
  longitude: number;
  language_family: string;
  endangerment_status: EndangermentStatus;
  endangerment_level: number;
  speaker_count: number | null;
  speaker_count_confidence?: "high" | "medium" | "low";
  countries: string[];
  contact_languages?: string[];
  preservation_status: PreservationStatus;
}

export interface LanguageBrowserStats {
  total_endangered: number;
  critically_endangered: number;
  extinct: number;
  with_preservation_data: number;
}

export interface LanguageBrowserResponse {
  languages: LanguageEntry[];
  total: number;
  stats: LanguageBrowserStats;
}

export interface SourceInfo {
  url: string;
  title: string;
  type: SourceType;
  entry_count: number;
  grammar_count: number;
  status?: PipelineSourceOutcome["status"];
  error?: string;
}

export interface LanguageFilters {
  search?: string;
  endangerment?: EndangermentStatus[];
  macroarea?: string[];
  family?: string;
  min_speakers?: number;
  max_speakers?: number;
  has_preservation?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export const ENDANGERMENT_COLORS: Record<EndangermentStatus, string> = {
  not_endangered: "#22C55E",
  vulnerable: "#EAB308",
  definitely_endangered: "#F97316",
  severely_endangered: "#EF4444",
  critically_endangered: "#DC2626",
  extinct: "#6B7280",
};

export const ENDANGERMENT_LABELS: Record<EndangermentStatus, string> = {
  not_endangered: "Not Endangered",
  vulnerable: "Vulnerable",
  definitely_endangered: "Definitely Endangered",
  severely_endangered: "Severely Endangered",
  critically_endangered: "Critically Endangered",
  extinct: "Extinct",
};

export const MACROAREAS = [
  "Africa",
  "Australia",
  "Eurasia",
  "North America",
  "Papunesia",
  "South America",
] as const;

// ── Map Visualization ─────────────────────────────────────────────────────────

export type MapVisualizationMode = "markers" | "heatmap" | "choropleth";
export type MapTheme = "dark" | "light";

export interface CountryLanguageStats {
  country_code: string;
  country_name: string;
  total_languages: number;
  by_endangerment: Partial<Record<EndangermentStatus, number>>;
  avg_endangerment_level: number;
}

// ── Pipeline Language Metadata ──────────────────────────────────────────────

export interface LanguageMetadata {
  language_name: string;
  language_code: string;           // ISO 639-3
  glottocode?: string;
  alternate_names?: string[];
  native_name?: string;            // endonym, e.g., "제주어"
  macroarea?: string;
  language_family?: string;
  countries?: string[];
  contact_languages?: string[];
  endangerment_status?: string;
  speaker_count?: number | null;
}

// ── Language Overview (AI-generated) ────────────────────────────────────────

export interface LinguisticFeatures {
  writing_system?: string;
  phonology?: string;
  word_order?: string;
  morphological_type?: string;
  notable_features?: string[];
}

export interface SpeakerDemographics {
  speaker_count_detail?: string;
  age_distribution?: string;
  geographic_distribution?: string;
  revitalization_efforts?: string;
}

export type ExternalLinkType = "wikipedia" | "glottolog" | "elp" | "elar" | "ethnologue" | "other";

export interface ExternalLink {
  url: string;
  title: string;
  type: ExternalLinkType;
}

export interface LanguageOverview {
  summary: string;
  linguistic_features: LinguisticFeatures;
  demographics: SpeakerDemographics;
  external_links: ExternalLink[];
  generated_at: string;
}

// ─── Pipeline Run Artifacts ─────────────────────────────────────────────────

export interface PipelineSourceOutcome {
  url: string;
  title: string;
  type: string;
  status: "extracted" | "failed" | "skipped_duplicate" | "skipped_content_hash" | "skipped_source_cap" | "cancelled";
  entry_count?: number;
  grammar_count?: number;
  audio_count?: number;
  error?: string;
}

export interface PipelineRunArtifact {
  id: string;
  language_code: string;
  language_name: string;
  glottocode?: string;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  status: "completed" | "failed" | "timeout";
  stats: {
    sources_discovered: number;
    sources_completed: number;
    sources_failed: number;
    sources_skipped: number;
    entries_extracted: number;
    grammar_patterns: number;
    audio_clips: number;
    cross_references: number;
  };
  sources: PipelineSourceOutcome[];
}

// ── Archive Filter/Sort Options ─────────────────────────────────────────────

export type VocabSortOption = "relevance" | "alphabetical" | "newest" | "sources";
export type GrammarSortOption = "relevance" | "newest" | "examples";
