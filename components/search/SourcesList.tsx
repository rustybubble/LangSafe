"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Captions, ChevronRight, ExternalLink, Globe, Layers, Loader2, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSources, fetchEntriesBySource } from "@/lib/api";
import { useAgentEventsContext } from "@/lib/websocket";
import { TranscriptViewer } from "@/components/transcripts/TranscriptViewer";
import type { SourceInfo, SourceType, VocabularyEntry } from "@/lib/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

// ── Source type styling ─────────────────────────────────────────────────────

const SOURCE_TYPE_META: Record<string, { label: string; color: string }> = {
  dictionary: { label: "Dictionary", color: "#1E40AF" },
  academic: { label: "Academic", color: "#6D28D9" },
  video: { label: "Video", color: "#DC2626" },
  archive: { label: "Archive", color: "#2563EB" },
  wiki: { label: "Wiki", color: "#047857" },
};

const STATUS_META: Record<string, { label: string; dotColor: string }> = {
  extracted: { label: "Extracted", dotColor: "#16a34a" },
  failed: { label: "Failed", dotColor: "#dc2626" },
  skipped_duplicate: { label: "Duplicate", dotColor: "#9ca3af" },
  skipped_content_hash: { label: "Duplicate content", dotColor: "#9ca3af" },
  skipped_source_cap: { label: "Cap reached", dotColor: "#d97706" },
  cancelled: { label: "Cancelled", dotColor: "#9ca3af" },
};

// ── Props ───────────────────────────────────────────────────────────────────

interface SourcesListProps {
  languageCode?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SourcesList({ languageCode }: SourcesListProps) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [transcriptVideoId, setTranscriptVideoId] = useState<string | null>(null);
  const { pipelineStatus, stats } = useAgentEventsContext();

  // Fetch on mount + when pipeline completes or new vocabulary is indexed
  useEffect(() => {
    setIsLoading(true);
    fetchSources(languageCode)
      .then(setSources)
      .finally(() => setIsLoading(false));
  }, [languageCode]);

  // Auto-refresh when pipeline adds new vocabulary
  useEffect(() => {
    if (pipelineStatus !== "running" && pipelineStatus !== "complete") return;
    if (stats.vocabulary === 0) return;

    const timer = setTimeout(() => {
      fetchSources(languageCode).then(setSources);
    }, pipelineStatus === "complete" ? 500 : 4000);

    return () => clearTimeout(timer);
  }, [stats.vocabulary, pipelineStatus, languageCode]);

  if (isLoading) return <SourcesListSkeleton />;

  if (sources.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Globe className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              No sources yet
            </p>
            <p className="mt-1 max-w-[240px] text-xs text-muted-foreground/60">
              Sources will appear here as the preservation pipeline discovers
              them
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalEntries = sources.reduce((sum, s) => sum + s.entry_count, 0);
  const totalGrammar = sources.reduce((sum, s) => sum + (s.grammar_count ?? 0), 0);
  const extractedCount = sources.filter((s) => s.status === "extracted" || !s.status).length;
  const failedCount = sources.filter((s) => s.status === "failed").length;

  // Count by type
  const typeCounts: Partial<Record<SourceType, number>> = {};
  for (const s of sources) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary header */}
      <div className="shrink-0 px-5 py-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-xs font-medium text-foreground/80">
              {sources.length} source{sources.length !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-muted-foreground/50">
              &middot; {totalEntries.toLocaleString()} entries
              {totalGrammar > 0 && ` · ${totalGrammar} grammar`}
              {failedCount > 0 && ` · ${failedCount} failed`}
            </span>
          </div>
          {pipelineStatus === "running" && (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(typeCounts).map(([type, count]) => {
            const meta = SOURCE_TYPE_META[type] ?? {
              label: type,
              color: "#78716C",
            };
            return (
              <Badge
                key={type}
                variant="outline"
                className="px-1.5 py-0 text-[10px] border-0"
                style={{
                  backgroundColor: `${meta.color}10`,
                  color: meta.color,
                }}
              >
                {meta.label} {count}
              </Badge>
            );
          })}
          {extractedCount > 0 && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] border-0 bg-green-500/10 text-green-700">
              {extractedCount} extracted
            </Badge>
          )}
        </div>
      </div>

      {/* Source list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="divide-y divide-border/30">
          {sources.map((source) => (
            <SourceRow
              key={source.url}
              source={source}
              languageCode={languageCode}
              onOpenTranscript={setTranscriptVideoId}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Transcript viewer dialog */}
      {transcriptVideoId && (
        <TranscriptViewer
          videoId={transcriptVideoId}
          open={!!transcriptVideoId}
          onOpenChange={(open) => {
            if (!open) setTranscriptVideoId(null);
          }}
        />
      )}
    </div>
  );
}

// ── Source Row (collapsible) ─────────────────────────────────────────────────

function SourceRow({
  source,
  languageCode,
  onOpenTranscript,
}: {
  source: SourceInfo;
  languageCode?: string;
  onOpenTranscript: (videoId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [entries, setEntries] = useState<VocabularyEntry[] | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);

  const typeMeta = SOURCE_TYPE_META[source.type] ?? {
    label: source.type,
    color: "#78716C",
  };

  const statusMeta = source.status ? STATUS_META[source.status] : undefined;
  const isFailed = source.status === "failed";
  const isSkipped = source.status?.startsWith("skipped_") || source.status === "cancelled";
  const hasData = source.entry_count > 0;
  const hasGrammar = (source.grammar_count ?? 0) > 0;

  const handleToggle = useCallback(() => {
    if (!hasData && !isFailed) return; // Nothing to expand for empty non-failed sources
    const next = !isExpanded;
    setIsExpanded(next);
    // Lazy-load entries on first expand
    if (next && hasData && entries === null && !isLoadingEntries) {
      setIsLoadingEntries(true);
      fetchEntriesBySource(source.url, languageCode)
        .then(setEntries)
        .finally(() => setIsLoadingEntries(false));
    }
  }, [isExpanded, entries, isLoadingEntries, source.url, languageCode, hasData, isFailed]);

  return (
    <div className={isSkipped ? "opacity-50" : ""}>
      {/* Header row */}
      <button
        onClick={handleToggle}
        className={`flex w-full items-center gap-3 px-5 py-3 text-sm transition-colors group text-left ${
          hasData || isFailed ? "hover:bg-secondary/50 cursor-pointer" : "cursor-default"
        }`}
      >
        {/* Status dot */}
        {statusMeta && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusMeta.dotColor }}
            title={statusMeta.label}
          />
        )}

        {/* Chevron — only for expandable rows */}
        {(hasData || isFailed) ? (
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}

        {/* Type badge */}
        <Badge
          variant="outline"
          className="shrink-0 border-0 px-1.5 py-0 text-[9px] font-medium"
          style={{
            backgroundColor: `${typeMeta.color}10`,
            color: typeMeta.color,
          }}
        >
          {typeMeta.label}
        </Badge>

        {/* Title */}
        <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground group-hover:text-foreground transition-colors">
          {source.title}
        </span>

        {/* Counts */}
        <span className="shrink-0 flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/50">
          {hasData && (
            <span>{source.entry_count} {source.entry_count === 1 ? "entry" : "entries"}</span>
          )}
          {hasGrammar && (
            <span className={hasData ? "border-l border-border/40 pl-1.5" : ""}>
              {source.grammar_count} grammar
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-0.5 text-red-500/70">
              <AlertCircle className="h-2.5 w-2.5" />
              Failed
            </span>
          )}
          {isSkipped && !isFailed && (
            <span className="flex items-center gap-0.5">
              <SkipForward className="h-2.5 w-2.5" />
              {statusMeta?.label ?? "Skipped"}
            </span>
          )}
          {!hasData && !hasGrammar && !isFailed && !isSkipped && (
            <span>0 entries</span>
          )}
        </span>

        {/* Transcript button (video sources only) */}
        {source.type === "video" && (() => {
          const vid = extractVideoId(source.url);
          return vid ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onOpenTranscript(vid);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenTranscript(vid);
                }
              }}
              className="shrink-0 p-1 -m-1 rounded hover:bg-primary/10 cursor-pointer"
              title="View transcript"
            >
              <Captions className="h-3 w-3 text-muted-foreground/30 hover:text-primary/60 transition-colors" />
            </span>
          ) : null;
        })()}

        {/* External link */}
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1 -m-1 rounded hover:bg-secondary"
          title="Open source"
        >
          <ExternalLink className="h-3 w-3 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" />
        </a>
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="border-t border-border/20 bg-secondary/20">
          {isFailed && source.error && (
            <p className="px-5 pl-12 py-3 text-xs text-red-500/70">
              {source.error}
            </p>
          )}
          {isLoadingEntries ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
            </div>
          ) : entries && entries.length > 0 ? (
            <div className="divide-y divide-border/20">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-baseline gap-2 px-5 pl-12 py-2"
                >
                  <span className="text-xs font-medium text-foreground/80 shrink-0">
                    {entry.headword_native}
                  </span>
                  {entry.pos && (
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 shrink-0">
                      {entry.pos}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/60 truncate">
                    {entry.definitions?.[0]?.text}
                  </span>
                </div>
              ))}
            </div>
          ) : hasData ? (
            <p className="px-5 pl-12 py-3 text-xs text-muted-foreground/50">
              No entries found
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function SourcesListSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="px-5 py-3 border-b border-border/40">
        <Skeleton className="h-4 w-32 mb-2" />
        <div className="flex gap-1.5">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-border/30">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
