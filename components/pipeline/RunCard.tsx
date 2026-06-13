"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Clock,
  FileText,
  BookOpen,
  Music,
  AlertCircle,
  CheckCircle2,
  XCircle,
  SkipForward,
  Hash,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineRunArtifact, PipelineSourceOutcome } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

const STATUS_CONFIG = {
  completed: {
    dot: "bg-emerald-500",
    label: "Completed",
    icon: CheckCircle2,
    color: "text-emerald-600",
  },
  failed: {
    dot: "bg-red-500",
    label: "Failed",
    icon: XCircle,
    color: "text-red-600",
  },
  timeout: {
    dot: "bg-sky-500",
    label: "Timeout",
    icon: AlertCircle,
    color: "text-sky-600",
  },
} as const;

const SOURCE_STATUS_CONFIG: Record<
  PipelineSourceOutcome["status"],
  { label: string; variant: "default" | "destructive" | "secondary" | "outline" }
> = {
  extracted: { label: "Extracted", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  skipped_duplicate: { label: "Duplicate", variant: "secondary" },
  skipped_content_hash: { label: "Unchanged", variant: "secondary" },
  skipped_source_cap: { label: "Source Cap", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

// ── Component ────────────────────────────────────────────────────────────────

export function RunCard({ run }: { run: PipelineRunArtifact }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[run.status];
  const StatusIcon = config.icon;

  return (
    <Card
      className="border-border/50 bg-card/80 cursor-pointer transition-colors hover:bg-card/95"
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-3">
        {/* Collapsed summary */}
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />

          {/* Time + duration */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">
                {relativeTime(run.completed_at)}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatDuration(run.duration_seconds)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <FileText className="h-2.5 w-2.5" />
                {run.stats.sources_completed}/{run.stats.sources_discovered} sources
              </span>
              <span className="flex items-center gap-0.5">
                <BookOpen className="h-2.5 w-2.5" />
                {run.stats.entries_extracted} entries
              </span>
              {run.stats.audio_clips > 0 && (
                <span className="flex items-center gap-0.5">
                  <Music className="h-2.5 w-2.5" />
                  {run.stats.audio_clips}
                </span>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          </motion.div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mt-3 border-t border-border/30 pt-3 space-y-3">
                {/* Status + timestamp */}
                <div className="flex items-center gap-2 text-xs">
                  <StatusIcon className={`h-3.5 w-3.5 ${config.color}`} />
                  <span className={config.color}>{config.label}</span>
                  <span className="text-muted-foreground/60">
                    {new Date(run.completed_at).toLocaleString()}
                  </span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCell
                    label="Discovered"
                    value={run.stats.sources_discovered}
                  />
                  <StatCell
                    label="Completed"
                    value={run.stats.sources_completed}
                    color="text-emerald-600"
                  />
                  <StatCell
                    label="Failed"
                    value={run.stats.sources_failed}
                    color={run.stats.sources_failed > 0 ? "text-red-500" : undefined}
                  />
                  <StatCell
                    label="Skipped"
                    value={run.stats.sources_skipped}
                  />
                  <StatCell label="Entries" value={run.stats.entries_extracted} />
                  <StatCell label="Grammar" value={run.stats.grammar_patterns} />
                  <StatCell label="Audio" value={run.stats.audio_clips} />
                  <StatCell label="Cross-refs" value={run.stats.cross_references} />
                </div>

                {/* Source outcomes */}
                {run.sources.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Hash className="h-2.5 w-2.5" />
                      Source Outcomes ({run.sources.length})
                    </p>
                    <ScrollArea className="max-h-[200px]">
                      <div className="space-y-1">
                        {run.sources.map((source, i) => (
                          <SourceRow key={i} source={source} />
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5 text-center">
      <div className={`text-sm font-bold tabular-nums ${color || "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceRow({ source }: { source: PipelineSourceOutcome }) {
  const config = SOURCE_STATUS_CONFIG[source.status];

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted/30">
      <Badge
        variant={config.variant}
        className="h-4 px-1.5 text-[9px] shrink-0"
      >
        {config.label}
      </Badge>
      <span className="truncate text-foreground/80 flex-1" title={source.title}>
        {source.title}
      </span>
      {source.status === "extracted" && (
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {source.entry_count ?? 0}e
          {(source.grammar_count ?? 0) > 0 && ` ${source.grammar_count}g`}
          {(source.audio_count ?? 0) > 0 && ` ${source.audio_count}a`}
        </span>
      )}
      {source.status === "failed" && source.error && (
        <span
          className="shrink-0 max-w-[120px] truncate text-[10px] text-red-500/70"
          title={source.error}
        >
          {source.error}
        </span>
      )}
    </div>
  );
}
