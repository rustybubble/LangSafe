"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { fetchInsights } from "@/lib/api";
import type { SignificantTermsResult, SignificantTerm } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DistinctiveVocabularyProps {
  languageCode?: string;
  onClusterClick?: (cluster: string) => void;
  activeCluster?: string | null;
}

export function DistinctiveVocabulary({
  languageCode,
  onClusterClick,
  activeCluster,
}: DistinctiveVocabularyProps) {
  const [insights, setInsights] = useState<SignificantTermsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const loadInsights = useCallback(async () => {
    if (!languageCode) return;
    setLoading(true);
    try {
      const result = await fetchInsights({ language_code: languageCode });
      // Only set if we have meaningful data
      const hasData = result.clusters.length > 0 || result.pos.length > 0 || result.terms.length > 0;
      setInsights(hasData ? result : null);
    } catch {
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [languageCode]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  if (loading || !insights) return null;

  // Merge clusters and POS into a single display list, interleaved
  const items: { term: SignificantTerm; type: "cluster" | "pos" | "term" }[] = [];

  for (const t of insights.clusters) {
    items.push({ term: t, type: "cluster" });
  }
  for (const t of insights.pos) {
    items.push({ term: t, type: "pos" });
  }
  for (const t of insights.terms.slice(0, 3)) {
    items.push({ term: t, type: "term" });
  }

  // Sort by score descending, take top items
  items.sort((a, b) => b.term.score - a.term.score);
  const displayItems = items.slice(0, 8);

  if (displayItems.length === 0) return null;

  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="h-3 w-3 text-sky-500" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
          Distinctive Patterns
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {displayItems.map(({ term, type }) => {
          const isActive = type === "cluster" && activeCluster === term.key;
          // Score-based opacity: higher score = more opaque
          const maxScore = displayItems[0]?.term.score ?? 1;
          const relativeScore = term.score / maxScore;
          const opacity = 0.5 + relativeScore * 0.5;

          return (
            <Badge
              key={`${type}-${term.key}`}
              variant={isActive ? "default" : "outline"}
              className={cn(
                "cursor-pointer px-2 py-0 text-[10px] transition-all",
                isActive
                  ? ""
                  : "hover:bg-sky-500/10 hover:text-sky-700 hover:border-sky-500/30 dark:hover:text-sky-300",
                type === "pos" && "border-dashed",
                type === "term" && "border-dotted"
              )}
              style={{ opacity: isActive ? 1 : opacity }}
              onClick={() => {
                if (type === "cluster" && onClusterClick) {
                  onClusterClick(isActive ? "" : term.key);
                }
              }}
            >
              {type === "pos" && (
                <span className="mr-0.5 text-muted-foreground/60">[</span>
              )}
              {term.key}
              {type === "pos" && (
                <span className="ml-0.5 text-muted-foreground/60">]</span>
              )}
              <span className={cn(
                "ml-1 tabular-nums",
                isActive ? "opacity-70" : "text-muted-foreground"
              )}>
                {term.doc_count}
              </span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
