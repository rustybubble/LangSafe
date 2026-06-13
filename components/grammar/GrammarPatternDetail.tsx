"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 font-serif text-xs uppercase tracking-wider text-muted-foreground">
      {children}
    </h4>
  );
}

interface GrammarPatternDetailProps {
  pattern: GrammarPattern | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVocabularyClick?: (term: string) => void;
}

export function GrammarPatternDetail({
  pattern,
  open,
  onOpenChange,
  onVocabularyClick,
}: GrammarPatternDetailProps) {
  if (!pattern) return null;

  const catColor = CATEGORY_COLORS[pattern.category] || "#78716C";
  const catLabel = GRAMMAR_CATEGORY_LABELS[pattern.category] || pattern.category;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="font-serif text-2xl tracking-tight">
              {pattern.title}
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-0 px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${catColor}10`, color: catColor }}
            >
              {catLabel}
            </Badge>
            {pattern.title_native && (
              <span className="text-sm">{pattern.title_native}</span>
            )}
            {pattern.confidence && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] capitalize">
                {pattern.confidence} confidence
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] xl:max-h-[70vh]">
          <div className="space-y-4 px-6 pb-6 pt-4">
            {/* Description */}
            <div>
              <SectionHeading>Description</SectionHeading>
              <p className="text-sm leading-relaxed">{pattern.description}</p>
            </div>

            {/* Rule */}
            {pattern.rule && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Rule</SectionHeading>
                  <div className="rounded-md border border-border/30 bg-muted/30 px-4 py-3">
                    <code className="text-sm font-mono text-foreground/80">{pattern.rule}</code>
                  </div>
                </div>
              </>
            )}

            {/* Differences from Contact Language */}
            {pattern.differences_from_contact && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Differences from Contact Language</SectionHeading>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {pattern.differences_from_contact}
                  </p>
                </div>
              </>
            )}

            {/* Examples */}
            {pattern.examples.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Examples</SectionHeading>
                  <div className="space-y-2">
                    {pattern.examples.map((ex, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-border/30 bg-background/50 p-3"
                      >
                        {ex.target && (
                          <p className="text-sm font-medium text-primary">{ex.target}</p>
                        )}
                        {ex.contact && (
                          <p className="mt-1 text-sm text-foreground/80">{ex.contact}</p>
                        )}
                        {ex.english && (
                          <p className="mt-0.5 text-sm italic text-muted-foreground">
                            {ex.english}
                          </p>
                        )}
                        {ex.annotation && (
                          <p className="mt-1.5 rounded bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground">
                            {ex.annotation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Related Vocabulary */}
            {pattern.related_vocabulary.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Related Vocabulary</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {pattern.related_vocabulary.map((term) => (
                      <Badge
                        key={term}
                        variant="secondary"
                        className="cursor-pointer px-2.5 py-0.5 text-xs transition-colors hover:bg-primary/20 hover:text-primary"
                        onClick={() => onVocabularyClick?.(term)}
                      >
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Sources */}
            {pattern.source_urls.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Sources</SectionHeading>
                  <div className="space-y-1">
                    {pattern.source_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:bg-secondary"
                      >
                        <span className="flex-1 truncate text-muted-foreground">{url}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
