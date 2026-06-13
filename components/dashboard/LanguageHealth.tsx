"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Globe,
  Volume2,
  Braces,
  TrendingUp,
  AlertTriangle,
  Video,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchStats, fetchPronunciationVideos } from "@/lib/api";
import { useAgentEventsContext } from "@/lib/websocket";
import { AnimatedNumber } from "@/components/agent-feed/counter-bar";
import type { LanguageStats, LanguageEntry, VocabularyEntry } from "@/lib/types";
import { ENDANGERMENT_LABELS } from "@/lib/types";
import { BrightDataImpact } from "@/components/dashboard/BrightDataImpact";

const ESTIMATED_TOTAL_VOCAB = 20_000;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRICS = [
  { key: "total_entries" as const, label: "Vocabulary Entries", icon: BookOpen, color: "#1E40AF", showTrend: true },
  { key: "total_sources" as const, label: "Sources Discovered", icon: Globe, color: "#047857", showTrend: false },
  { key: "total_audio_clips" as const, label: "Audio Clips", icon: Volume2, color: "#6D28D9", showTrend: false },
  { key: "grammar_patterns" as const, label: "Grammar Patterns", icon: Braces, color: "#2563EB", showTrend: false },
];

const SOURCE_TYPES = [
  { key: "dictionary" as const, label: "Dictionary", color: "#1E40AF" },
  { key: "academic" as const, label: "Academic", color: "#6D28D9" },
  { key: "video" as const, label: "Video", color: "#DC2626" },
  { key: "archive" as const, label: "Archive", color: "#2563EB" },
  { key: "wiki" as const, label: "Wiki", color: "#047857" },
];

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const tileVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
};

// ---------------------------------------------------------------------------
// CoverageRing
// ---------------------------------------------------------------------------

function CoverageRing({
  percentage,
  totalEntries,
}: {
  percentage: number;
  totalEntries: number;
}) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  const color =
    percentage > 10 ? "#10B981" : percentage > 5 ? "#0A84FF" : "#EF4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width={140} height={140} viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx={60} cy={60} r={radius}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={8}
          />
          {/* Animated progress arc */}
          <motion.circle
            cx={60} cy={60} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            transform="rotate(-90 60 60)"
          />
        </svg>
        {/* Center text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-0.5">
            <AnimatedNumber value={Math.round(percentage)} color={color} />
            <span className="text-sm font-bold" style={{ color }}>%</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Preserved</span>
        </div>
      </div>
      {/* Context label */}
      <p className="text-[11px] text-muted-foreground">
        <span className="font-mono tabular-nums">{totalEntries.toLocaleString()}</span>
        {" "}of ~{ESTIMATED_TOTAL_VOCAB.toLocaleString()} words
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom recharts tooltip
// ---------------------------------------------------------------------------

function SourceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const meta = SOURCE_TYPES.find((s) => s.key === item.name);
  return (
    <div className="rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs shadow-lg">
      <span style={{ color: meta?.color }}>{meta?.label ?? item.name}</span>
      <span className="ml-2 font-bold font-mono">{item.value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LanguageHealthSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-center py-3">
        <Skeleton className="h-[150px] w-[150px] rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[100px] rounded-xl" />
      <Skeleton className="h-[140px] rounded-xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeaturedPronunciations
// ---------------------------------------------------------------------------

function FeaturedPronunciations({
  languageCode,
  pipelineStatus,
}: {
  languageCode?: string;
  pipelineStatus: string;
}) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);

  const loadVideos = useCallback(() => {
    fetchPronunciationVideos(languageCode, 5).then(setEntries).catch(() => {});
  }, [languageCode]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    if (pipelineStatus === "complete") {
      const timer = setTimeout(loadVideos, 15_000);
      return () => clearTimeout(timer);
    }
  }, [pipelineStatus, loadVideos]);

  if (entries.length === 0) return null;

  return (
    <Card className="gap-0 border-border/50 bg-card/80 px-3 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Video className="h-3 w-3" />
        Pronunciation Videos
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border/40 bg-background/50 p-2"
          >
            <video
              src={entry.pronunciation_video_url}
              autoPlay muted loop playsInline
              className="h-[120px] w-[120px] rounded-md bg-black object-cover"
            />
            <div className="text-center">
              <p className="text-sm font-semibold leading-tight">
                {entry.headword_native}
              </p>
              {entry.headword_romanized && (
                <p className="text-[10px] text-muted-foreground">
                  {entry.headword_romanized}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LanguageHealth
// ---------------------------------------------------------------------------

interface LanguageHealthProps {
  language?: LanguageEntry;
}

export function LanguageHealth({ language }: LanguageHealthProps) {
  const [baseStats, setBaseStats] = useState<LanguageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { stats: liveStats, pipelineStatus } = useAgentEventsContext();

  const languageCode = language?.iso_code;

  // Poll ES every 30s for baseline
  useEffect(() => {
    let cancelled = false;

    fetchStats(languageCode).then((data) => {
      if (!cancelled) {
        setBaseStats(data);
        setIsLoading(false);
      }
    });

    const interval = setInterval(() => {
      fetchStats(languageCode).then((data) => {
        if (!cancelled) setBaseStats(data);
      });
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [languageCode]);

  // Immediate refresh when pipeline finishes
  useEffect(() => {
    if (pipelineStatus === "complete" || pipelineStatus === "error") {
      const timer = setTimeout(() => {
        fetchStats(languageCode).then(setBaseStats);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pipelineStatus, languageCode]);

  // Merge baseline with live deltas during pipeline runs
  const stats = useMemo<LanguageStats | null>(() => {
    if (!baseStats) return null;
    if (pipelineStatus !== "running") return baseStats;

    const totalEntries = baseStats.total_entries + liveStats.vocabulary;
    return {
      ...baseStats,
      total_entries: totalEntries,
      total_sources: baseStats.total_sources + liveStats.sources,
      total_audio_clips: baseStats.total_audio_clips + liveStats.audioClips,
      coverage_percentage:
        Math.round((totalEntries / ESTIMATED_TOTAL_VOCAB) * 1000) / 10,
    };
  }, [baseStats, liveStats, pipelineStatus]);

  if (isLoading || !stats) {
    return <LanguageHealthSkeleton />;
  }

  const chartData = [{ ...stats.sources_by_type }];

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-4">
        {/* ── Section 1: Coverage Ring ──────────────────────────────────── */}
        <CoverageRing
          percentage={stats.coverage_percentage}
          totalEntries={stats.total_entries}
        />

        {/* ── Section 1.5: Featured Pronunciations ─────────────────────── */}
        <FeaturedPronunciations
          languageCode={languageCode}
          pipelineStatus={pipelineStatus}
        />

        {/* ── Section 2: Key Metrics (2x2 grid) ───────────────────────── */}
        <motion.div
          className="grid grid-cols-2 gap-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {METRICS.map(({ key, label, icon: Icon, color, showTrend }) => (
            <motion.div key={key} variants={tileVariants}>
              <Card className="gap-0 border-border/50 bg-card/80 px-3 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ backgroundColor: `${color}10` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <AnimatedNumber value={stats[key]} color={color} />
                  {showTrend && (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Section 3: Sources Breakdown ──────────────────────────────── */}
        <Card className="gap-0 border-border/50 bg-card/80 px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sources by Type
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SOURCE_TYPES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {s.label}{" "}
                  <span className="font-medium font-mono text-foreground">
                    {stats.sources_by_type[s.key]}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {stats.total_sources > 0 && (
            <div className="mt-2">
              <ResponsiveContainer width="100%" height={24}>
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                  barCategoryGap={0}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip
                    content={<SourceTooltip />}
                    cursor={false}
                  />
                  {SOURCE_TYPES.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      stackId="sources"
                      fill={s.color}
                      barSize={20}
                      radius={
                        i === 0
                          ? [4, 0, 0, 4]
                          : i === SOURCE_TYPES.length - 1
                            ? [0, 4, 4, 0]
                            : [0, 0, 0, 0]
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* ── Section 3.5: BrightData Impact ───────────────────────────── */}
        <BrightDataImpact />

        {/* ── Section 4: Language Info ──────────────────────────────────── */}
        {language && (
          <Card className="gap-0 border-border/50 bg-card/80 px-3 py-3">
            <div className="space-y-2">
              {/* Language name */}
              <div>
                <h3 className="font-serif text-sm tracking-tight text-foreground">
                  {language.name}
                </h3>
                {language.glottocode && (
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/50">
                    {language.glottocode}
                  </p>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span>
                  Status:{" "}
                  <Badge
                    variant="outline"
                    className="border-0 px-1.5 py-0 text-[10px] font-medium"
                    style={{ backgroundColor: "#0A84FF10", color: "#2563EB" }}
                  >
                    {ENDANGERMENT_LABELS[language.endangerment_status]}
                  </Badge>
                </span>
              </div>

              {/* Metadata */}
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div>
                  {language.speaker_count != null && language.speaker_count > 0
                    ? `Estimated speakers: ~${language.speaker_count.toLocaleString()}`
                    : language.speaker_count === 0
                      ? "No living speakers"
                      : "Speaker count unknown"}
                </div>
                <div>Family: {language.language_family}</div>
                <div>Region: {language.macroarea}</div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Section 5: Footer ────────────────────────────────────────── */}
        <div className="border-t border-border/40 pt-3">
          <p className="text-center text-[11px] italic text-muted-foreground/60">
            In minutes, LangSafe preserved what would take a linguist months
            to compile manually.
          </p>
        </div>
      </div>
    </div>
  );
}
