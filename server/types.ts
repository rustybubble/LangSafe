import type { VisualContent } from "../lib/crawlers/dispatch.js";

// ─── Shared types (re-exported from lib/types.ts — single source of truth) ───

export type {
  AgentType,
  AgentStatus,
  SourceType,
  AgentEvent,
  LanguageMetadata,
  Conjugation,
  MorphologyInfo,
  UsageInfo,
  GrammarCategory,
  GrammarExample,
  GrammarPattern,
  VocabularyEntry,
} from "../lib/types.js";

// ─── Server-only types ───

import type { LanguageMetadata, SourceType, VocabularyEntry, GrammarPattern, AgentEvent } from "../lib/types.js";

export interface PreservationRequest extends LanguageMetadata {
  language?: string; // backward compat alias for language_name
}

export interface DiscoveredSource {
  url: string;
  title: string;
  type: SourceType;
  description?: string;
  estimated_entries?: number;
  discovered_via?: "featherless" | "serp_api" | "priority";
}

export interface CrawlResult {
  url: string;
  title: string;
  type: SourceType;
  content: string;
  visual_content?: VisualContent;
  metadata: Record<string, unknown>;
}

export interface ExtractionResult {
  source_url: string;
  source_title: string;
  entries: VocabularyEntry[];
  grammar_patterns: GrammarPattern[];
  audio_refs: string[];
}

// ─── Socket.io typed events ───

export interface ServerToClientEvents {
  agent_event: (event: AgentEvent) => void;
  pipeline_status: (data: { running: boolean }) => void;
}

export interface ClientToServerEvents {
  start_preservation: (req: PreservationRequest) => void;
  inject_source: (source: { url: string; title?: string; type?: string }) => void;
  stop_pipeline: () => void;
}
