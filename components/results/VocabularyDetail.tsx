"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  ExternalLink,
  BookOpen,
  GraduationCap,
  Video,
  Archive,
  Globe,
  Tag,
  GitCompareArrows,
  Loader2,
  Search,
  Quote,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { VocabularyEntry, CrossReference } from "@/lib/types";
import { generatePronunciation, checkPronunciationCache } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/utils/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_ICONS: Record<string, React.ElementType> = {
  dictionary: BookOpen,
  academic: GraduationCap,
  video: Video,
  archive: Archive,
  wiki: Globe,
};

const SOURCE_COLORS: Record<string, string> = {
  dictionary: "#1E40AF",
  academic: "#6D28D9",
  video: "#DC2626",
  archive: "#2563EB",
  wiki: "#047857",
};

const POS_COLORS: Record<string, string> = {
  noun: "#1E40AF",
  verb: "#047857",
  adjective: "#2563EB",
  adverb: "#6D28D9",
  particle: "#DC2626",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isPlayableAudioUrl(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith("/audio/")) return true;
  try {
    const parsed = new URL(url);
    return /\.(mp3|wav|ogg|m4a|webm|aac|flac)(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function PronounceButton({ text, className }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const synth = window.speechSynthesis;
    if (!synth) return;

    // Cancel any in-progress speech
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    synth.speak(utterance);
  }, [text]);

  // Don't render if speech synthesis is unavailable
  if (typeof window === "undefined") return null;
  if (!window.speechSynthesis) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? "h-8 w-8 shrink-0"}
      onClick={handleClick}
      title="Pronounce"
      type="button"
    >
      <Volume2
        className={`h-4 w-4 transition-colors ${
          speaking ? "text-primary animate-pulse" : "text-muted-foreground hover:text-primary"
        }`}
      />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Audio Player
// ---------------------------------------------------------------------------

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {
        // Audio may fail to play (e.g. placeholder URL)
        setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
    },
    [duration]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={toggle}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-primary" />
        ) : (
          <Play className="h-4 w-4 text-primary" />
        )}
      </Button>
      <div
        ref={progressRef}
        className="flex-1 cursor-pointer"
        onClick={handleSeek}
      >
        <Progress value={progress} className="h-1.5" />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading helper
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 font-serif text-xs uppercase tracking-wider text-muted-foreground">
      {children}
    </h4>
  );
}

// ---------------------------------------------------------------------------
// Source Comparison — highlights unique words per definition
// ---------------------------------------------------------------------------

/** Tokenise a definition into lowercase word set (strips punctuation). */
function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/** Build the set of words shared across ALL definitions. */
function commonWords(definitions: string[]): Set<string> {
  if (definitions.length === 0) return new Set();
  const sets = definitions.map(wordSet);
  const common = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const w of common) {
      if (!sets[i].has(w)) common.delete(w);
    }
  }
  return common;
}

/** Render definition text with unique words highlighted. */
function HighlightedDefinition({
  text,
  common,
}: {
  text: string;
  common: Set<string>;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <p className="text-sm leading-relaxed">
      {tokens.map((token, i) => {
        const cleaned = token
          .toLowerCase()
          .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
        if (!cleaned || /^\s+$/.test(token)) {
          return <span key={i}>{token}</span>;
        }
        const isUnique = !common.has(cleaned);
        return isUnique ? (
          <span key={i} className="font-semibold text-primary">
            {token}
          </span>
        ) : (
          <span key={i}>{token}</span>
        );
      })}
    </p>
  );
}

function SourceComparison({ refs }: { refs: CrossReference[] }) {
  const withDefs = refs.filter((r) => r.definition);
  if (withDefs.length < 2) return null;

  const common = commonWords(withDefs.map((r) => r.definition!));

  return (
    <>
      <Separator />
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <GitCompareArrows className="h-3.5 w-3.5" />
            Source Comparison
            <Badge
              variant="secondary"
              className="ml-1 px-1.5 py-0 text-[10px]"
            >
              {withDefs.length} sources
            </Badge>
          </span>
        </SectionHeading>

        <div className="space-y-2">
          {withDefs.map((ref) => {
            const Icon = SOURCE_ICONS[ref.source_type] || Globe;
            const color = SOURCE_COLORS[ref.source_type] || "#94A3B8";
            return (
              <div
                key={ref.source_url}
                className="rounded-md border border-border/30 bg-background/50 p-3"
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color }}
                  />
                  <span className="flex-1 truncate text-xs font-medium">
                    {ref.source_title}
                  </span>
                  <a
                    href={ref.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <HighlightedDefinition
                  text={ref.definition!}
                  common={common}
                />
                {ref.notes && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    {ref.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pronunciation Video (HeyGen Avatar)
// ---------------------------------------------------------------------------

function PronunciationVideoSection({ word, language, audioUrl }: { word: string; language?: string; audioUrl?: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heygenFailed, setHeygenFailed] = useState(false);

  // Auto-check cache on mount or word change
  useEffect(() => {
    let cancelled = false;
    setVideoUrl(null);
    setCached(false);
    setError(null);
    setLoading(false);
    setHeygenFailed(false);
    setChecking(true);

    checkPronunciationCache(word, language).then((result) => {
      if (cancelled) return;
      if (result?.video_url) {
        setVideoUrl(result.video_url);
        setCached(true);
      }
      setChecking(false);
    });

    return () => { cancelled = true; };
  }, [word, language]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generatePronunciation(word, { language, audioUrl });
      setVideoUrl(result.video_url);
      setCached(false);
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to generate video");
      setHeygenFailed(true);
    } finally {
      setLoading(false);
    }
  }, [word, language, audioUrl]);

  if (checking) {
    return (
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" />
            Pronunciation Avatar
          </span>
        </SectionHeading>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <span className="text-xs text-muted-foreground">Checking for video...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading>
        <span className="inline-flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5" />
          Pronunciation Avatar
          {cached && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              cached
            </Badge>
          )}
        </span>
      </SectionHeading>

      {videoUrl ? (
        <div className="overflow-hidden rounded-lg border border-border/50">
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            className="w-full max-w-[320px] aspect-square bg-black"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Video className="mr-1.5 h-3.5 w-3.5" />
                  Generate Video
                </>
              )}
            </Button>
            {loading && (
              <span className="text-xs text-muted-foreground">
                This may take up to a minute
              </span>
            )}
            {error && (
              <span className="text-xs text-destructive">{error}</span>
            )}
          </div>

          {heygenFailed && (
            <div className="flex items-center gap-2 rounded-md border border-border/30 bg-background/50 p-2">
              <PronounceButton text={word} className="h-8 w-8 shrink-0" />
              <span className="text-xs text-muted-foreground">
                Video unavailable — use browser speech instead
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Knowledge Provenance — Sonar citation transparency
// ---------------------------------------------------------------------------

function ProvenanceSection({ entry }: { entry: VocabularyEntry }) {
  const citationRefs = entry.cross_references.filter((r) => r.notes);

  if (!entry.cultural_context && citationRefs.length === 0) return null;

  return (
    <>
      <Separator />
      <div>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" />
            Knowledge Provenance
            <Badge
              variant="outline"
              className="ml-1 gap-1 border-0 px-1.5 py-0 text-[10px] font-medium"
              style={{ backgroundColor: "#6D28D910", color: "#6D28D9" }}
            >
              Perplexity Sonar
            </Badge>
          </span>
        </SectionHeading>

        {/* Cultural context — prominent blockquote */}
        {entry.cultural_context && (
          <div className="mb-3 rounded-md border-l-[3px] border-primary/60 bg-primary/[0.03] py-2.5 pe-3 ps-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Quote className="h-3 w-3 text-primary/50" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-primary/50">
                Cultural Context
              </span>
            </div>
            <p className="font-serif text-sm italic leading-relaxed text-foreground/80">
              {entry.cultural_context}
            </p>
          </div>
        )}

        {/* Citation sources — what Sonar cited for this entry */}
        {citationRefs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cited Sources
            </p>
            {citationRefs.map((ref) => {
              const Icon = SOURCE_ICONS[ref.source_type] || Globe;
              const color = SOURCE_COLORS[ref.source_type] || "#94A3B8";
              let hostname: string;
              try {
                hostname = new URL(ref.source_url).hostname.replace(/^www\./, "");
              } catch {
                hostname = ref.source_title;
              }
              return (
                <div
                  key={`prov-${ref.source_url}`}
                  className="rounded-md border border-border/30 bg-background/50 p-2.5"
                  style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color }}
                    />
                    <span className="flex-1 truncate text-xs font-medium">
                      {hostname}
                    </span>
                    <a
                      href={ref.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-[11px] italic leading-relaxed text-muted-foreground">
                    &ldquo;{ref.notes}&rdquo;
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// VocabularyDetail
// ---------------------------------------------------------------------------

interface VocabularyDetailProps {
  entry: VocabularyEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelatedTermClick?: (term: string) => void;
  languageName?: string;
}

export function VocabularyDetail({
  entry,
  open,
  onOpenChange,
  onRelatedTermClick,
  languageName,
}: VocabularyDetailProps) {
  if (!entry) return null;

  const posColor = POS_COLORS[entry.pos] || "#94A3B8";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="flex items-baseline gap-3">
              <span className="font-serif text-5xl tracking-tight" dir="auto">
                {entry.headword_native}
              </span>
              <Badge
                variant="outline"
                className="border-0 px-2 py-0.5 text-xs font-medium uppercase"
                style={{ backgroundColor: `${posColor}10`, color: posColor }}
              >
                {entry.pos}
              </Badge>
            </DialogTitle>
            <PronounceButton text={entry.headword_native} />
          </div>
          {(entry.headword_romanized || entry.ipa) && (
            <DialogDescription className="text-sm italic">
              {entry.headword_romanized}
              {entry.ipa && (
                <span className="ms-2 font-mono text-xs text-muted-foreground">
                  {entry.ipa}
                </span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Scrollable body */}
        <ScrollArea className="max-h-[60vh] xl:max-h-[70vh]">
          <div className="space-y-4 px-6 pb-6 pt-4">
            {/* Audio player — only for real audio URLs */}
            {isPlayableAudioUrl(entry.audio_url) && (
              <>
                <AudioPlayer src={entry.audio_url!} />
                <Separator />
              </>
            )}

            {/* Pronunciation avatar video */}
            <PronunciationVideoSection word={entry.headword_native} language={languageName} audioUrl={entry.audio_url} />
            <Separator />

            {/* Definitions */}
            <div>
              <SectionHeading>Definitions</SectionHeading>
              <div className="space-y-2">
                {entry.definitions.map((def, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Badge
                      variant="secondary"
                      className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase"
                    >
                      {def.language}
                    </Badge>
                    <p className="text-sm leading-relaxed">{def.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Source comparison (shows when 3+ sources have definitions) */}
            {entry.cross_references.length >= 3 && (
              <SourceComparison refs={entry.cross_references} />
            )}

            {/* Knowledge provenance — Sonar citation transparency */}
            <ProvenanceSection entry={entry} />

            {/* Conjugations */}
            {entry.conjugations && entry.conjugations.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Conjugations</SectionHeading>
                  <div className="overflow-hidden rounded-md border border-border/30">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30 bg-muted/30">
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Form</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">{languageName || "Target"}</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Romanized</th>
                          <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.conjugations.map((conj, i) => (
                          <tr key={i} className="border-b border-border/20 last:border-0">
                            <td className="px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground">{conj.form}</td>
                            <td className="px-3 py-1.5 font-serif">{conj.native}</td>
                            <td className="px-3 py-1.5 italic text-muted-foreground">{conj.romanized}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{conj.notes || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Morphology */}
            {entry.morphology && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Word Formation</SectionHeading>
                  <div className="rounded-md border border-border/30 bg-background/50 p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Root:</span>
                      <span className="font-serif">{entry.morphology.root}</span>
                      <span className="text-sm italic text-muted-foreground">({entry.morphology.root_romanized})</span>
                    </div>
                    {entry.morphology.affixes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Affixes:</span>
                        <div className="flex flex-wrap gap-1">
                          {entry.morphology.affixes.map((affix, i) => (
                            <Badge key={i} variant="outline" className="px-1.5 py-0 text-xs font-mono">
                              {affix}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {entry.morphology.compound_parts && entry.morphology.compound_parts.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Parts:</span>
                        <span className="text-sm">{entry.morphology.compound_parts.join(" + ")}</span>
                      </div>
                    )}
                    {entry.morphology.derivation_notes && (
                      <p className="text-xs italic text-muted-foreground">{entry.morphology.derivation_notes}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Usage */}
            {entry.usage && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Usage</SectionHeading>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="px-2 py-0.5 text-xs capitalize">
                      {entry.usage.register}
                    </Badge>
                    {entry.usage.frequency && (
                      <Badge variant="secondary" className="px-2 py-0.5 text-xs capitalize">
                        {entry.usage.frequency}
                      </Badge>
                    )}
                    {entry.usage.age_group && (
                      <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                        {entry.usage.age_group}
                      </Badge>
                    )}
                    {entry.usage.geographic_note && (
                      <Badge variant="secondary" className="px-2 py-0.5 text-xs">
                        {entry.usage.geographic_note}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Grammar Notes */}
            {entry.grammar_notes && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Grammar Notes</SectionHeading>
                  <p className="text-sm leading-relaxed text-foreground/80">{entry.grammar_notes}</p>
                </div>
              </>
            )}

            {/* Example sentences */}
            {entry.example_sentences.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Example Sentences</SectionHeading>
                  <div className="space-y-2">
                    {entry.example_sentences.map((ex, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-border/30 bg-background/50 p-3"
                      >
                        <p className="text-sm font-medium text-primary" dir="auto">
                          {ex.target}
                        </p>
                        {ex.contact && (
                          <p className="mt-1 text-sm text-foreground/80" dir="auto">
                            {ex.contact}
                          </p>
                        )}
                        {ex.english && (
                          <p className="mt-0.5 text-sm italic text-muted-foreground">
                            {ex.english}
                          </p>
                        )}
                        {ex.source_url && (
                          <a
                            href={ex.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Related terms */}
            {entry.related_terms.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Related Terms</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.related_terms.map((term) => (
                      <Badge
                        key={term}
                        variant="secondary"
                        className="cursor-pointer px-2.5 py-0.5 text-xs transition-colors hover:bg-primary/20 hover:text-primary"
                        onClick={() => onRelatedTermClick?.(term)}
                      >
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Source provenance */}
            {entry.cross_references.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionHeading>Sources</SectionHeading>

                  {entry.semantic_cluster && (
                    <Badge
                      variant="secondary"
                      className="mb-3 gap-1 px-2 py-0.5 text-xs"
                    >
                      <Tag className="h-3 w-3" />
                      {entry.semantic_cluster}
                    </Badge>
                  )}

                  <div className="space-y-1">
                    {entry.cross_references.map((ref) => {
                      const Icon = SOURCE_ICONS[ref.source_type] || Globe;
                      const color =
                        SOURCE_COLORS[ref.source_type] || "#94A3B8";
                      return (
                        <a
                          key={ref.source_url}
                          href={ref.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-md p-2 text-sm transition-colors hover:bg-secondary"
                        >
                          <Icon
                            className="h-4 w-4 shrink-0"
                            style={{ color }}
                          />
                          <span className="flex-1 truncate">
                            {ref.source_title}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </a>
                      );
                    })}
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
