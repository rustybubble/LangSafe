"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { GrammarPattern } from "@/lib/types";
import { GRAMMAR_CATEGORY_LABELS } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  verb_conjugation: "#047857",
  particle_usage: "#1E40AF",
  sentence_structure: "#6D28D9",
  honorific_system: "#2563EB",
  negation: "#DC2626",
  question_formation: "#0891B2",
  phonological_rule: "#7C3AED",
  morphological_rule: "#DB2777",
  other: "#78716C",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-600",
  medium: "text-sky-600",
  low: "text-red-500",
};

interface GrammarPatternCardProps {
  pattern: GrammarPattern;
  onClick?: (pattern: GrammarPattern) => void;
}

export function GrammarPatternCard({ pattern, onClick }: GrammarPatternCardProps) {
  const catColor = CATEGORY_COLORS[pattern.category] || "#78716C";
  const catLabel = GRAMMAR_CATEGORY_LABELS[pattern.category] || pattern.category;

  return (
    <motion.div
      layout
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`border-b border-border/40 py-4 transition-colors ${
          onClick ? "cursor-pointer hover:bg-secondary/30" : ""
        }`}
        onClick={() => onClick?.(pattern)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <h3 className="font-serif text-lg tracking-tight">{pattern.title}</h3>
              {pattern.title_native && (
                <span className="text-sm text-muted-foreground">{pattern.title_native}</span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-0 px-1.5 py-0 text-[10px] font-medium"
                style={{ backgroundColor: `${catColor}10`, color: catColor }}
              >
                {catLabel}
              </Badge>
              {pattern.confidence && (
                <span className={`text-[10px] font-medium uppercase ${CONFIDENCE_COLORS[pattern.confidence] || ""}`}>
                  {pattern.confidence}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {pattern.examples.length > 0 && (
              <span>{pattern.examples.length} example{pattern.examples.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-foreground/85 line-clamp-2">
          {pattern.description}
        </p>

        {pattern.rule && (
          <div className="mt-2 rounded border border-border/30 bg-muted/30 px-3 py-1.5">
            <code className="text-xs text-foreground/70">{pattern.rule}</code>
          </div>
        )}

        {/* Related vocabulary + source count */}
        <div className="mt-3 flex items-center gap-3">
          {pattern.related_vocabulary.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {pattern.related_vocabulary.length} related term{pattern.related_vocabulary.length !== 1 ? "s" : ""}
            </span>
          )}
          {pattern.source_urls.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {pattern.source_urls.length} source{pattern.source_urls.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
