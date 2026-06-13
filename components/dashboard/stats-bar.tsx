"use client";

import { useEffect, useState, useMemo } from "react";
import { MOCK_STATS } from "@/lib/mock-events";
import { fetchStats } from "@/lib/api";
import { LanguageStats } from "@/lib/types";
import { useAgentEventsContext } from "@/lib/websocket";
import {
  BookOpen,
  Globe,
  Volume2,
  Braces,
  TrendingUp,
} from "lucide-react";

interface DisplayStat {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}

function buildDisplayStats(
  base: LanguageStats,
  live: { sources: number; vocabulary: number; audioClips: number }
): DisplayStat[] {
  return [
    {
      label: "Entries",
      value: Math.max(base.total_entries, base.total_entries + live.vocabulary).toLocaleString(),
      icon: BookOpen,
      color: "#1E40AF",
    },
    {
      label: "Sources",
      value: Math.max(base.total_sources, base.total_sources + live.sources).toString(),
      icon: Globe,
      color: "#047857",
    },
    {
      label: "Audio",
      value: Math.max(base.total_audio_clips, base.total_audio_clips + live.audioClips).toLocaleString(),
      icon: Volume2,
      color: "#6D28D9",
    },
    {
      label: "Grammar",
      value: base.grammar_patterns.toString(),
      icon: Braces,
      color: "#0A84FF",
    },
    {
      label: "Coverage",
      value: `${base.coverage_percentage}%`,
      icon: TrendingUp,
      color: "#D92D20",
    },
  ];
}

export function StatsBar({ languageCode }: { languageCode?: string } = {}) {
  const [baseStats, setBaseStats] = useState<LanguageStats>(MOCK_STATS);
  const { stats: liveStats, pipelineStatus } = useAgentEventsContext();

  useEffect(() => {
    let cancelled = false;

    fetchStats(languageCode).then((data) => {
      if (!cancelled) setBaseStats(data);
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

  // When pipeline finishes, do an immediate refresh to sync ES totals
  useEffect(() => {
    if (pipelineStatus === "complete" || pipelineStatus === "error") {
      const timer = setTimeout(() => {
        fetchStats(languageCode).then(setBaseStats);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pipelineStatus, languageCode]);

  // Merge ES baseline with live pipeline deltas
  const displayStats = useMemo(
    () => buildDisplayStats(baseStats, pipelineStatus === "running" ? liveStats : { sources: 0, vocabulary: 0, audioClips: 0 }),
    [baseStats, liveStats, pipelineStatus]
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 font-mono">
      {displayStats.map((stat) => (
        <div
          key={stat.label}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-secondary/60"
        >
          <div
            className="flex h-5 w-5 items-center justify-center rounded"
            style={{ backgroundColor: `${stat.color}0C` }}
          >
            <stat.icon className="h-3 w-3" style={{ color: stat.color }} />
          </div>
          <div className="flex flex-col">
            <p className="text-[11px] font-bold tabular-nums leading-none">{stat.value}</p>
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground/70">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
