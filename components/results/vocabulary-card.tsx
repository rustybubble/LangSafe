"use client";

import { motion } from "framer-motion";
import { Volume2, Tag, Video, BookText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VocabularyEntry } from "@/lib/types";
import { useCallback, useRef, useState } from "react";

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

interface VocabularyCardProps {
  entry: VocabularyEntry;
  onCardClick?: (entry: VocabularyEntry) => void;
  languageName?: string;
}

export function VocabularyCard({ entry, onCardClick }: VocabularyCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasRealAudio = isPlayableAudioUrl(entry.audio_url);

  const handlePronounce = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Prefer real audio file if available
    if (hasRealAudio && audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
      } else {
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      }
      return;
    }

    // Fallback: browser TTS
    const synth = window.speechSynthesis;
    if (!synth) return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.headword_native);
    utterance.rate = 0.85;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    synth.speak(utterance);
  }, [entry.headword_native, hasRealAudio, isPlaying]);

  const posColor = POS_COLORS[entry.pos] || "#78716C";
  const enDef = entry.definitions.find((d) => d.language === "en");
  const contactDef = entry.definitions.find((d) => d.language !== "en");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`border-b border-border/40 py-4 transition-colors ${
          onCardClick ? "cursor-pointer hover:bg-secondary/30" : ""
        }`}
        onClick={() => onCardClick?.(entry)}
      >
        {/* Header: headword + POS + audio */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h3 className="font-serif text-2xl xl:text-3xl tracking-tight" dir="auto">
                {entry.headword_native}
              </h3>
              <Badge
                variant="outline"
                className="border-0 px-1.5 py-0 text-[10px] font-medium uppercase"
                style={{ backgroundColor: `${posColor}10`, color: posColor }}
              >
                {entry.pos}
              </Badge>
            </div>
            {(entry.headword_romanized || entry.ipa) && (
              <p className="mt-0.5 text-sm italic text-muted-foreground">
                {entry.headword_romanized}
                {entry.ipa && (
                  <span className="ms-1.5 font-mono text-xs text-muted-foreground/70">
                    {entry.ipa}
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handlePronounce}
              title="Pronounce"
              type="button"
            >
              <Volume2
                className={`h-4 w-4 ${
                  isPlaying
                    ? "text-primary animate-pulse"
                    : "text-muted-foreground"
                }`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onCardClick?.(entry);
              }}
              title="Avatar pronunciation"
              type="button"
            >
              <Video className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Definitions — inline, editorial */}
        <div className="mt-2.5 space-y-1">
          {enDef && (
            <p className="text-sm leading-relaxed text-foreground/85">
              {enDef.text}
            </p>
          )}
          {contactDef && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="text-[10px] uppercase text-muted-foreground/50 mr-1">{contactDef.language}</span>
              {contactDef.text}
            </p>
          )}
        </div>

        {/* Semantic cluster + source dots */}
        <div className="mt-3 flex items-center gap-3">
          {entry.semantic_cluster && (
            <Badge
              variant="secondary"
              className="gap-1 px-1.5 py-0 text-[10px]"
            >
              <Tag className="h-2.5 w-2.5" />
              {entry.semantic_cluster}
            </Badge>
          )}

          {entry.conjugations && entry.conjugations.length > 0 && (
            <Badge
              variant="outline"
              className="gap-1 px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              <BookText className="h-2.5 w-2.5" />
              {entry.conjugations.length} forms
            </Badge>
          )}

          {/* Source provenance dots */}
          <div className="flex items-center gap-1">
            {entry.cross_references.map((ref) => {
              const color = SOURCE_COLORS[ref.source_type] || "#78716C";
              return (
                <div key={ref.source_url} className="group relative">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 group-hover:block">
                    <div className="whitespace-nowrap rounded border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md">
                      {ref.source_title}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {entry.cross_references.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {entry.cross_references.length}{" "}
              {entry.cross_references.length === 1 ? "source" : "sources"}
            </span>
          )}
        </div>
        {hasRealAudio && (
          <audio
            ref={audioRef}
            src={entry.audio_url}
            preload="metadata"
            onEnded={() => setIsPlaying(false)}
            onError={() => setIsPlaying(false)}
          />
        )}
      </div>
    </motion.div>
  );
}
